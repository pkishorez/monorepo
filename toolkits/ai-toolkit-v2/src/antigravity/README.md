# @kestack/ai-toolkit-v2/antigravity

The Antigravity CLI (`agy`) as one Effect Service in the Agent Client Protocol's own types, with one `agy acp` process per live session and a fake that replays recordings.

## Big picture

`Antigravity` follows the [harness contract](../../docs/contract.md). Each live session runs its own `agy acp`, spoken to over ACP on stdio with `@agentclientprotocol/sdk`, initialized with `elicitation: { form: {} }` so agy can ask questions. `create` is `session/new` (its `sessionId` is `Started`; `systemPrompt` goes to `_meta.antigravity.systemPrompt.append`), `send` goes to the live session or starts a process that calls `session/resume`, which replays nothing. Its `mode` is `queue` (the default: a `send` during a Run waits its turn, `Queued`) or `steer`: during a Run in progress, its prompt joins that Run ahead of anything queued, and its stream is that Run, from its `Started` to its `Ended`; otherwise it runs as `queue` does. A steer uses only `prompt`; `config`, `flags` and `session` apply when it runs as its own Run. A Run's `config` values are sent with `session/set_config_option` before its prompt: `model`, `thought_level` (`low` to `xhigh`) and `mode` (`default`, `accept-edits`, `auto`, `plan`). Every `session/update` of a Run is a `Record`; `session/request_permission` and `elicitation/create` are `Requested`, answered by `respond` with that method's own response. `connection(id)` is the raw ACP connection of a live session.

Harness methods: `initialize` and `listSessions` (`session/list`, every session of the profile unless `cwd` is given) start a short-lived `agy acp` per call; `setConfigOption` and `closeSession` need the live session and fail `NotLive` without one. The advertised commands (`/goal`, `/compact`, `/schedule`, skills...) come in `available_commands_update` and live on `Live.commands`; run one by sending its text as a prompt. `prompt` is a one-shot `agy --print --output-format json`, kept only for `--json-schema` structured output, which ACP lacks.

Limits set by agy 1.5.17:

- No `fork`: `session/fork` is "Method not found".
- A steer is a second `session/prompt`. agy answers the running prompt `end_turn` at once and carries on under the new one, commands and subagents untouched. That answer is the `Steered` element (agy echoes no user message), not the end of the Run, which ends with the last prompt's answer.
- agy does not queue prompts; the Service does.
- `cancel` is `session/cancel`: the prompt answers `cancelled`, running commands are killed, pending requests are answered `cancelled`, and the process stays up.
- Permission options are `allow`, `deny` and sometimes `allow_always`; a security warning may sit in an option's `_meta` key `agy.security.warning`. A permission whose tool call id starts with `interaction_` is a choice question.
- A question is a form with `q1` as a `oneOf` and a free-text `q1_other`. Answer `q1` with the choice's `const` (`"2"`), not its title: a title reads as skipped.
- A finished background command or timer can wake the agent with no prompt open. Those `session/update`s belong to no Run: they show on `watch(id)` as `Live.update`, the latest one. A short background command was seen to hold its prompt open instead.
- `flags` (`--add-dir`, `--agent`, `--gemini-dir`, `--app-data-dir`, `--sandbox`...) are per process: a `send` routed to a live session keeps the flags it started with.
- Each first prompt costs about 15k input tokens of system prompt, cached afterwards.

Background work: agy has no switch for its background commands and timers. None is set; they stop with the process, after `linger`.

The fake replays the recording whose name equals the prompt's first text, or the first one. A recorded request waits for `respond`. A second prompt ends the first with `end_turn`, as agy does. An `{ exit: true }` step ends the fake process; a recording's `after` updates come once its prompt has answered, as a wake-up would. `agent` holds the fixed answers: `initialize`, the session's modes and config options, commands, `session/list` and the `prompt` result.

## Install

See the [top README](../../README.md). The real Layer needs `@effect/platform-node` and the `agy` CLI on `PATH`, signed in.

## Exports

### `@kestack/ai-toolkit-v2/antigravity`

| Export             | What it does                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `Antigravity`      | The Service: the session verbs, `connection`, `setConfigOption`, `closeSession` and the one-shots. |
| `AntigravityError` | The error for a process that cannot start or a request agy refuses before any Run.                 |
| `NotLive`          | The error for a call that needs a live session when there is none.                                 |

### `@kestack/ai-toolkit-v2/antigravity/real`

| Export  | What it does                                                                    |
| ------- | ------------------------------------------------------------------------------- |
| `layer` | The real Layer: runs `binary` (default `agy`), lingering 30 seconds by default. |

### `@kestack/ai-toolkit-v2/antigravity/fake`

| Export       | What it does                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `layer`      | The whole Service without agy, replaying `recordings` at `pace` and answering from `agent`.                          |
| `recordings` | The Runs the e2e test captured: `create`, `send`, `resumed`, `permission`, `steer`, `steered`, `question`, `cancel`. |
| `agent`      | The recorded fixed answers: `initialize`, session modes and config options, commands, sessions.                      |

## Usage

### Run a prompt, allow a command, steer it

```ts
import { Effect, Stream } from 'effect';
import { Antigravity } from '@kestack/ai-toolkit-v2/antigravity';
import * as AntigravityReal from '@kestack/ai-toolkit-v2/antigravity/real';

const text = (value: string) => [{ type: 'text' as const, text: value }];

const program = Effect.gen(function* () {
  const agy = yield* Antigravity;
  let id = '';
  yield* agy
    .create({
      session: { cwd: '/tmp/work', mcpServers: [] },
      config: [
        { configId: 'model', value: 'gemini-3.8-flash' },
        { configId: 'thought_level', value: 'low' },
      ],
      prompt: text('Use run_command to run: sleep 5 ; then reply done'),
    })
    .pipe(
      Stream.runForEach((out) => {
        if (out._tag === 'Started') id = out.id;
        if (
          out._tag === 'Requested' &&
          out.request.method === 'session/request_permission'
        )
          return agy
            .respond(id, out.request.id, {
              outcome: { outcome: 'selected', optionId: 'allow' },
            })
            .pipe(
              Effect.andThen(
                agy
                  .send({
                    session: { sessionId: id, cwd: '/tmp/work' },
                    prompt: text('Reply steered instead'),
                    mode: 'steer',
                  })
                  .pipe(Stream.runDrain, Effect.forkChild),
              ),
            );
        if (out._tag === 'Ended') return Effect.log(out.status);
        return Effect.void;
      }),
    );
}).pipe(Effect.provide(AntigravityReal.layer()));
```

- `create` starts `agy acp` in `cwd`, calls `session/new`, sets the config, then prompts.
- The permission is `Requested` and stays on `Live.requests` until `respond` answers it.
- The steering `send` streams the Run it joined: one `Steered` where agy took it, then a single `Ended` for both prompts.
- Sent while the session is idle or not live, the same `send` runs as its own Run.

### Test without agy

```ts
import * as AntigravityFake from '@kestack/ai-toolkit-v2/antigravity/fake';

const layer = AntigravityFake.layer({ linger: '100 millis', pace: '5 millis' });
```

- The fake shares the router and instance code and only swaps the driver, so queueing, steer, cancel, linger and process death behave as with agy.
- `AI_TOOLKIT_V2_E2E=1 vitest run src/antigravity` rewrites the recordings from the real agy.
