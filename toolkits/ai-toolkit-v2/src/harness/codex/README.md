# @kestack/ai-toolkit-v2/harness/codex

Codex as one Effect Service in the `codex app-server` protocol's own types, with one app-server process per live thread and a fake that replays recordings.

## Big picture

`Codex` follows the [harness contract](../../../docs/contract.md). Each live thread runs its own `codex app-server`, spoken to over JSON-RPC on stdio, started with `initialize` (`experimentalApi: true`). `create` is `thread/start` then `turn/start`, and `Started` carries the thread id as soon as `thread/start` answers. `send` goes to the live thread, or starts a process that calls `thread/resume`; with `mode: 'queue'` (the default) it waits behind a Run in progress. `fork` is `thread/fork` on a fresh process; pass `lastTurnId` (an `Ended.at`) in its `thread` params. `cancel` is `turn/interrupt`. `send` with `mode: 'steer'` joins a turn in progress with `turn/steer` (the running turn as `expectedTurnId`, only `turn.input`, `clientUserMessageId` and the metadata fields), skipping anything queued, and streams the Run it joined from its start; with no turn in progress, on an idle or not live thread, or when Codex refuses the steer because the turn just ended, it runs as `mode: 'queue'` would. Options are the protocol's own `ThreadStartParams`, `ThreadResumeParams`, `ThreadForkParams` and `TurnStartParams` (model, effort, cwd, sandbox, approval policy, `outputSchema`, `config` overrides...). Every server notification of a Run is a `Record`; every server request (approvals, `item/tool/requestUserInput`, MCP elicitations, dynamic tool calls...) is `Requested`, answered by `respond` with that method's own response type. `request(id, method, params)` is the raw, typed JSON-RPC channel of a live thread.

The protocol types in `contract/protocol.gen.ts` are generated from the installed Codex with `node src/harness/codex/tests/protocol.ts` (`codex app-server generate-ts --experimental`, flattened into one file, with method-to-params-and-result maps). The e2e test fails when they no longer match the installed `codex`. The harness-specific methods are stateless and start a short-lived app-server per call: `models` (`model/list`), `account`, `rateLimits`, `usage` (`account/usage/read`), `threads` (`thread/list`), `read` (`thread/read`), `skills`, `mcpStatus` and `config`. `compact` (`thread/compact/start`) needs the live thread and fails `NotLive` without one.

Limits set by Codex 0.164.0:

- No working switch for background terminals. `--disable unified_exec`, `-c features.unified_exec=false` and `-c experimental_use_unified_exec_tool=false` were each tried, on the command line and as thread `config`: a command the agent leaves running still shows in `thread/backgroundTerminals/list` after its turn ends. None is set; such commands stop with the process, after `linger`.
- A steer comes back as a `userMessage` item, at the point the agent took it, with `clientId` set to the steer's `clientUserMessageId`. A steer send sets one when the caller does not, and that item's `item/completed` is the `Steered` element; its `item/started` stays a `Record`.
- `Ended.result` is the text of the Run's last `agentMessage`. With `outputSchema` it is the JSON text.
- A Run that Codex does not end within 5 seconds of `turn/interrupt` ends `cancelled` anyway.
- Server requests that arrive outside a Run are kept on `Live.requests` but are not streamed.
- The fake replays the recording whose name equals the turn's first text input, or the first one. A recorded request waits for `respond` before the next notification. An `{ exit }` step ends the fake process, as a death would. Steers are echoed by the fake itself.

## Install

See the [top README](../../../README.md). The real Layer needs `@effect/platform-node` and the `codex` CLI on `PATH`, signed in.

## Exports

### `@kestack/ai-toolkit-v2/harness/codex`

| Export       | What it does                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `Codex`      | The Service: the session verbs (`send` queues or steers), `request`, `compact` and the stateless Codex methods. |
| `CodexError` | The error for a process that cannot start or a request Codex refuses before any Run.                            |
| `NotLive`    | The error for a call that needs a live thread when there is none.                                               |

### `@kestack/ai-toolkit-v2/harness/codex/real`

| Export   | What it does                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------- |
| `layer`  | The real Layer: runs `command` (default `codex`) with `args` and `env`, lingering 30 s by default. |
| `driver` | The Layer of the app-server driver alone, for raw JSON-RPC calls outside `Codex`.                  |

### `@kestack/ai-toolkit-v2/harness/codex/fake`

| Export       | What it does                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `layer`      | The whole Service without Codex, replaying `recordings` and answering from recorded `answers`.     |
| `recordings` | The Runs the e2e test captured: `create`, `steer`, `approval`, `cancel`, `structured`.             |
| `answers`    | The recorded results of the stateless methods, such as `model/list`, `thread/list`, `config/read`. |

## Usage

### Run a turn and answer an approval

```ts
import { Effect, Stream } from 'effect';
import { Codex } from '@kestack/ai-toolkit-v2/harness/codex';
import * as CodexReal from '@kestack/ai-toolkit-v2/harness/codex/real';

const program = Effect.gen(function* () {
  const codex = yield* Codex;
  let id = '';
  yield* codex
    .create({
      thread: {
        cwd: '/tmp/work',
        approvalPolicy: 'untrusted',
        sandbox: 'read-only',
      },
      turn: {
        input: [
          {
            type: 'text',
            text: 'Run `touch made.txt`, then reply done.',
            text_elements: [],
          },
        ],
        model: 'gpt-6-luna',
        effort: 'low',
      },
    })
    .pipe(
      Stream.runForEach((out) => {
        if (out._tag === 'Started') id = out.id;
        if (
          out._tag === 'Requested' &&
          out.request.method === 'item/commandExecution/requestApproval'
        )
          return codex.respond(id, out.request.id, { decision: 'accept' });
        if (out._tag === 'Ended') return Effect.log(out.status, out.result);
        return Effect.void;
      }),
    );
}).pipe(Effect.provide(CodexReal.layer()));
```

- `create` starts an app-server in the thread's `cwd`, calls `thread/start`, then `turn/start`.
- The approval is `Requested` and stays on `Live.requests` until `respond` answers it.
- After `Ended` the process lingers 30 seconds for the next `send`, then stops.

### Steer a turn in progress

```ts
const say = (text: string) => ({
  input: [{ type: 'text' as const, text, text_elements: [] }],
});

const joined =
  yield *
  codex
    .send({ id, turn: say('Also end your reply with STEERED.'), mode: 'steer' })
    .pipe(Stream.runCollect);
```

- While a turn runs, the stream is that Run's, from its `Started` to its `Ended`, with the steer's `userMessage` as `Steered` where Codex took it.
- On an idle thread, a thread that is not live, or a turn that has just ended, it is a Run of its own, as with `mode: 'queue'`.

### Fork from where a Run ended, on the fake

```ts
import { Effect, Stream } from 'effect';
import { Codex } from '@kestack/ai-toolkit-v2/harness/codex';
import * as CodexFake from '@kestack/ai-toolkit-v2/harness/codex/fake';

const turn = (text: string) => ({
  input: [{ type: 'text' as const, text, text_elements: [] }],
});

const program = Effect.gen(function* () {
  const codex = yield* Codex;
  const first = yield* Stream.runCollect(
    codex.create({ turn: turn('create') }),
  );
  const started = first[0];
  const ended = first.at(-1);
  if (started?._tag !== 'Started' || ended?._tag !== 'Ended') return;
  const forked = yield* Stream.runCollect(
    codex.fork({
      id: started.id,
      thread: { lastTurnId: ended.at ?? null },
      turn: turn('structured'),
    }),
  );
  const last = forked.at(-1);
  if (last?._tag === 'Ended')
    yield* Effect.log(JSON.parse(last.result ?? '{}'));
  yield* Effect.log(yield* codex.models());
}).pipe(Effect.provide(CodexFake.layer({ linger: 0 })));
```

- The fake picks a recording by the turn's text: `create`, then `structured`, whose result is the JSON of its `outputSchema`.
- `Ended.at` is the turn id, the fork point `thread/fork` takes as `lastTurnId`; the fork gets a fresh thread id.
- `models` and the other stateless methods answer from `CodexFake.answers`.
