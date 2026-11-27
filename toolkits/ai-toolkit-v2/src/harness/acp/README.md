# @kestack/ai-toolkit-v2/harness/acp

Any Agent Client Protocol agent, such as `agy acp`, as an Effect Service the app names, one per agent, in ACP's own types, with one agent process per live session and a fake that replays recordings.

## Big picture

Each ACP agent follows the [harness contract](../../../docs/contract.md) as its own Service. The package gives the Service's shape, `AcpAgent`, and no tag: the app declares one plain `Context.Service` per agent (`class Goose extends Context.Service<Goose, AcpAgent>()('app/Goose') {}`), and `AcpReal.layer(Goose, { command, args, env })` or `AcpFake.layer(Goose, { recordings })` provides it, so several agents run side by side, each with its own router and processes. For agents known only at run time, such as commands a user configures, `make(options)` returns the Service value itself in the caller's `Scope`, for the app to keep in its own map; `layer` is `make` as a Layer. Each live session runs its own agent process over stdio, through the official `@agentclientprotocol/sdk` (its `/unstable` entry, for `session/fork`). The process is sent `initialize` first, and its `InitializeResponse` (capabilities, auth methods, agent info) stays on `Live.initialize`. `create` is `session/new` then `session/prompt`. `send` prompts the live session, or starts a process that calls `session/resume` (preferred, as it replays nothing) or `session/load`, whichever the agent advertises; with neither, the stream fails `AcpError`. `cancel` sends `session/cancel` and answers every pending request as cancelled (`cancelled` for a permission, `cancel` for an elicitation), as ACP asks. `session/update` notifications are `Record`s, unchanged. Two agent requests are `Requested`, told apart by `method`: `session/request_permission`, answered by `respond` with a `RequestPermissionResponse`, and `elicitation/create`, answered with a `CreateElicitationResponse` (`accept` with `content`, `decline` or `cancel`). An answer of the wrong shape fails `AcpError`. ACP has no steer, so `send` has no `mode`. `fork` calls `session/fork` only when the agent advertises `sessionCapabilities.fork`.

The client advertises one capability, form elicitation (`elicitation: { form: {} }`). `fs.readTextFile`, `fs.writeTextFile` and `terminal` are all `false`, so the agent reads, writes and runs commands itself, and the toolkit writes no files. URL elicitation, session cursors and auth are not advertised. The extra methods are stateless: `initialize` and `listSessions` start a process, ask and stop it; `setMode`, `setConfigOption` and `connection` (the SDK's `ClientContext` of the live process, the raw channel) need the live session and fail `NotLive`. Models are config options in ACP (`category: 'model'`), set with `setConfigOption`, or with `config` on a Run.

Limits set by ACP and the agents:

- ACP has no switch for background jobs, so none is set.
- `session/load` replays history as `session/update` before any Run; those updates are not part of a Run, so they are dropped.
- `Ended.at` is never set: fork points are session cursors, which need the client's `session.cursors` capability.
- An agent that blocks in `initialize` holds the Run in `starting`.
- Antigravity asks its `ask_question` questions as form elicitations: each question is a string property (`q1`, `q2`, …) whose `oneOf` holds the choices, with `const` values `"1"`, `"2"`, …, plus an optional free-text property (`q1_other`). Answer `{ action: 'accept', content: { q1: '1' } }`.
- `Live.modes` and `Live.configOptions` follow `current_mode_update`, `config_option_update`, `setMode` and `setConfigOption`.
- The fake replays the recording whose `name` equals the prompt's first text block, or the first one. A `{ request }` step sends `session/request_permission` and an `{ elicitation }` step `elicitation/create`, both with the fresh session id; a `{ exit: true }` step closes the fake agent, as a process death would. Its `initialize`, `session/list` and session answers come from the first recording.

## Install

See the [top README](../../../README.md). The real Layer needs `@effect/platform-node` and an ACP agent on `PATH`.

## Exports

### `@kestack/ai-toolkit-v2/harness/acp`

| Export     | What it does                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `AcpAgent` | The Service's type: `create`, `fork`, `send`, `respond`, `cancel`, `watch`, `live` and the ACP methods. |
| `AcpError` | The error for an agent that cannot start or refuses a request before any Run.                           |
| `NotLive`  | The error for a call that needs a live session when there is none.                                      |

### `@kestack/ai-toolkit-v2/harness/acp/real`

| Export  | What it does                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `make`  | The Service over a real agent, in the caller's `Scope`: runs `command` with `args` and `env` per live session, lingering 30 s by default. |
| `layer` | `layer(tag, options)`: `make` as the Layer for the app's own tag.                                                                         |

### `@kestack/ai-toolkit-v2/harness/acp/fake`

| Export       | What it does                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `make`       | The whole Service without an agent, replaying `recordings` (Antigravity's by default), in the caller's `Scope`. |
| `layer`      | `layer(tag, options)`: `make` as the Layer for the app's own tag.                                               |
| `recordings` | The Antigravity Runs the e2e test captured: `reply`, `send`, `permission`, `question`, `cancelled`, `resumed`.  |

## Usage

### Declare an agent, run a prompt and answer its requests

The app names the agent with its own tag. A Run is a Stream. A `Requested` element, a permission or a question, waits until `respond` answers it with the protocol's own result; the Run belongs to the instance, so a reader that stops does not cancel it.

```ts
import { Context, Effect, Stream } from 'effect';
import type { AcpAgent } from '@kestack/ai-toolkit-v2/harness/acp';
import * as AcpReal from '@kestack/ai-toolkit-v2/harness/acp/real';

class Agy extends Context.Service<Agy, AcpAgent>()('app/Agy') {}

const program = Effect.gen(function* () {
  const acp = yield* Agy;
  let id = '';
  return yield* acp
    .create({
      session: { cwd: '/tmp/work', mcpServers: [] },
      prompt: [{ type: 'text', text: 'Create hi.txt containing hi.' }],
      config: [{ configId: 'model', value: 'gemini-3.8-flash' }],
    })
    .pipe(
      Stream.tap((out) => {
        if (out._tag === 'Started') id = out.id;
        if (out._tag !== 'Requested') return Effect.void;
        if (out.method === 'session/request_permission')
          return acp.respond(id, out.requestId, {
            outcome: { outcome: 'selected', optionId: 'allow' },
          });
        return acp.respond(id, out.requestId, {
          action: 'accept',
          content: { q1: '1' },
        });
      }),
      Stream.runCollect,
    );
}).pipe(Effect.provide(AcpReal.layer(Agy, { command: 'agy', args: ['acp'] })));
```

- `Started` comes first with the `sessionId` from `session/new`; `Ended` comes last.
- `config` and `mode` are set with `session/set_config_option` and `session/set_mode` when the Run starts.
- A question is `elicitation/create`: `out.request` holds its `message` and, for a form, `requestedSchema`. With Antigravity, `q1: '1'` picks the first choice; `{ action: 'decline' }` and `{ action: 'cancel' }` answer without content.
- After the last Run or `watch` reader lets go, the process lingers, then stops; the next `send` resumes it.

### Test against the fake

`AcpFake.layer` provides the same tag, replaying a recording per Run with fresh session ids, and shares the router, so queueing, cancel, requests and linger behave as with a real agent.

```ts
import { Effect, Stream } from 'effect';
import * as AcpFake from '@kestack/ai-toolkit-v2/harness/acp/fake';

const outs = Effect.gen(function* () {
  const acp = yield* Agy;
  return yield* acp
    .create({
      session: { cwd: '/tmp/work', mcpServers: [] },
      prompt: [{ type: 'text', text: 'reply' }],
    })
    .pipe(Stream.runCollect);
}).pipe(Effect.provide(AcpFake.layer(Agy)));
```

- The prompt `reply` picks the recording named `reply`; any other text plays the first recording. `question` replays Antigravity's elicitation.
- Pass `recordings` to replay your own, such as one ending in `{ exit: true }` to test a process death.

### Run agents a user configures

A command known only at run time has no tag. `make` gives its Service in the caller's `Scope`, for the app to keep by name.

```ts
import { Effect } from 'effect';
import type { Scope } from 'effect';
import type { AcpAgent } from '@kestack/ai-toolkit-v2/harness/acp';
import * as AcpReal from '@kestack/ai-toolkit-v2/harness/acp/real';

const agents = (
  configured: Record<string, { command: string; args: Array<string> }>,
): Effect.Effect<Map<string, AcpAgent>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const byName = new Map<string, AcpAgent>();
    for (const [name, options] of Object.entries(configured)) {
      byName.set(name, yield* AcpReal.make(options));
    }
    return byName;
  });
```

- Each agent has its own router: a session id is looked up only in the agent that made it, and `NotLive` comes from the others.
- Closing the `Scope` stops every agent's processes.
