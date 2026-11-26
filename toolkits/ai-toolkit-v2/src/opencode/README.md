# @kestack/ai-toolkit-v2/opencode

OpenCode 2 as one Effect Service, hosted in-process by its own Effect SDK, typed in OpenCode's words, with one live instance per session and a fake that replays real recordings.

## Big picture

The Layer starts one OpenCode host with `@opencode/sdk/effect`'s `OpenCode.create`. The SDK runs OpenCode in the same process: its server routes answer through an in-memory `fetch`, with no listener and no network hop, and the installed `opencode2` binary is not used. That one host serves every session, and the router keeps one live instance per session id on top of it. `create` makes a session (its id is `Started` before any prompt) and prompts it; `send` prompts an existing one, after any Run in progress (`mode: 'queue'`, the default); `fork` is OpenCode's own fork `before` a message; `cancel` is OpenCode's interrupt, and fails `OpenCodeError` when OpenCode refuses it. The rules every harness follows are in [the harness contract](../../docs/contract.md).

`send` with `mode: 'steer'` joins the Run in progress instead of waiting: it prompts with OpenCode's `delivery: 'steer'`, skipping anything queued, and streams the Run it joined from its start. The steer's inbox message comes back as `Steered` where OpenCode delivers it. Only the prompt is used then. With no live instance, or none running, it is a plain `send`, so it always works. OpenCode delivers every prompt as `steer` by default, and a steer that reaches a session that has just gone idle starts a new execution, so a Run with a steer not yet delivered lasts until that steer is delivered and its execution ends.

Records are the host's events for that session, unchanged. `permission.asked` and `form.created` (OpenCode's questions) come as `Requested`; `respond` answers with OpenCode's own reply, `{ decision, message? }` for a permission or `{ answer }` for a form. A Run ends on the first `session.execution.succeeded`, `failed` or `interrupted` after its own prompt was delivered, as `completed`, `failed` or `cancelled`. OpenCode gives no final result and no fork point of its own at the end of a Run, so `Ended` has neither; fork takes the id of the message to fork `before`.

The Service also answers, per call, with OpenCode's own inputs and outputs: `sessions`, `session`, `messages`, `message`, `context`, `diff`, `compact`, `revert`, `unrevert`, `commitRevert`, `update`, `remove`, `switchModel`, `switchAgent`, `permissions`, `forms`, `providers`, `models`, `defaultModel`, `agents`, `commands`, `skills`, `config`, `mcp` and `usageLimits`. `client` is the SDK's whole client, for everything else.

Limits set by OpenCode and its SDK. The host keeps its database in memory unless `host.database.path` names a file; only a file database imports the credentials in OpenCode's `auth.json`, so with the default only the free OpenCode models are there, and they have a usage limit. Do not point it at the database a running `opencode2` service uses: SDK 2.4.1 and that binary are different versions. OpenCode has background work of its own (background shell and subagent jobs, `session.background`, automations, background compaction, cache warming); it lives in the host, which lives as long as the Layer, not the instance, so no switch is used and it stops when the Layer closes. A Run started by OpenCode itself, such as a subagent job waking a session, is not followed. The SDK's `.d.ts` files use extensionless relative imports, so under `moduleResolution: nodenext` OpenCode's types collapse to `any`; with `bundler` resolution they are exact.

## Install

See the [top README](../../README.md).

## Exports

### `@kestack/ai-toolkit-v2/opencode`

| Export          | What it does                                                  |
| --------------- | ------------------------------------------------------------- |
| `OpenCode`      | The Service tag, keyed `@kestack/ai-toolkit-v2/OpenCode`.     |
| `NotLive`       | Tagged error when a session has no live instance.             |
| `OpenCodeError` | Tagged error when OpenCode cannot start or refuses a request. |

### `@kestack/ai-toolkit-v2/opencode/real`

| Export  | What it does                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------- |
| `layer` | The real Layer: one in-process OpenCode host, given the SDK's own `host` options and a `linger` time. |

### `@kestack/ai-toolkit-v2/opencode/fake`

| Export       | What it does                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `layer`      | The whole Service without OpenCode: a Run replays the recording named by its prompt text, or the first, with fresh ids. |
| `recordings` | The recordings the e2e test saved from the real OpenCode: `create`, `send`, `fork`, `permission` and `cancel`.          |
| `methods`    | The fixed answers of the harness-specific methods, recorded by the e2e test.                                            |

In the fake, a requested permission or form waits for `respond`, `cancel` ends the Run `cancelled`, a recording with no end ends its Run `failed` the way a lost host would, and the harness-specific methods answer from the `methods` option or the recorded `methods`.

## Usage

### Answer a permission and steer the Run

A session that must ask before using the shell. The Run waits at `Requested`; a `send` with `mode: 'steer'` joins it, and the answer lets it go on. Lifted from [opencode.e2e.test.ts](tests/opencode.e2e.test.ts).

```ts
import { Effect, Stream } from 'effect';
import { OpenCode, type SessionID } from '@kestack/ai-toolkit-v2/opencode';
import * as OpenCodeReal from '@kestack/ai-toolkit-v2/opencode/real';

const program = Effect.gen(function* () {
  const opencode = yield* OpenCode;
  let id: SessionID | undefined;
  return yield* opencode
    .create({
      session: {
        location: { directory: '/work/repo' },
        model: { providerID: 'google', id: 'gemini-3.5-flash-lite' },
        permissions: [{ action: 'shell', resource: '*', effect: 'ask' }],
      },
      prompt: { text: 'Use the shell tool to run: echo hi.' },
    })
    .pipe(
      Stream.tap((out) =>
        out._tag === 'Started'
          ? Effect.sync(() => (id = out.id))
          : out._tag === 'Requested' && out.request.type === 'permission.asked'
            ? opencode
                .send({
                  sessionID: out.request.data.sessionID,
                  prompt: { text: 'Also say: steered' },
                  mode: 'steer',
                })
                .pipe(
                  Stream.runDrain,
                  Effect.forkChild,
                  Effect.andThen(
                    opencode.respond(
                      out.request.data.sessionID,
                      out.request.data.id,
                      {
                        decision: 'once',
                      },
                    ),
                  ),
                )
            : Effect.void,
      ),
      Stream.runCollect,
    );
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      OpenCodeReal.layer({ host: { database: { path: '/tmp/opencode.db' } } }),
    ),
  ),
);
```

- `OpenCodeReal.layer` starts one host; every session of the program shares it.
- The Run stays at `Requested` until `respond`; `Live.requests` holds the request meanwhile.
- `Steered` comes where OpenCode delivers the steer, and `Ended` is always last.
- The steer's own stream is the same Run, read from its start.

### Test without OpenCode

The fake runs the same router on recorded events. A recording named by the prompt text is replayed, so `permission` waits for an answer. Lifted from [opencode.test.ts](tests/opencode.test.ts).

```ts
import { Deferred, Effect, Fiber, Option, Stream } from 'effect';
import { OpenCode, type SessionID } from '@kestack/ai-toolkit-v2/opencode';
import * as OpenCodeFake from '@kestack/ai-toolkit-v2/opencode/fake';

const program = Effect.gen(function* () {
  const opencode = yield* OpenCode;
  const started = yield* Deferred.make<SessionID>();
  const fiber = yield* opencode.create({ prompt: { text: 'permission' } }).pipe(
    Stream.tap((out) =>
      out._tag === 'Started' ? Deferred.succeed(started, out.id) : Effect.void,
    ),
    Stream.runCollect,
    Effect.forkChild,
  );
  const id = yield* Deferred.await(started);
  const live = yield* opencode.watch(id).pipe(
    Stream.filter((now) => now.requests.length > 0),
    Stream.runHead,
  );
  const request = Option.getOrUndefined(live)?.requests[0];
  if (request?.type === 'permission.asked') {
    yield* opencode.respond(id, request.data.id, { decision: 'once' });
  }
  return yield* Fiber.join(fiber);
});

Effect.runPromise(program.pipe(Effect.provide(OpenCodeFake.layer())));
```

- Each Run gets fresh session, message and request ids.
- `linger` is a Layer option on both Layers; the default is 30 seconds.
- `OpenCodeFake.layer({ recordings, methods })` swaps in your own recordings and fixed answers.
