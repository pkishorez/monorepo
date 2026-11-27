# @kestack/ai-toolkit-v2/harness/claude

Claude Code as one Effect Service, through the Claude Agent SDK, typed in the SDK's own words, with one live process per session and a fake.

## Big picture

`Claude` follows the [harness contract](../../../docs/contract.md). Each live session is one SDK `query()` in streaming-input mode; a Run is one pushed user message and every record until Claude Code answers it. Records, requests (`canUseTool`'s arguments), answers (`PermissionResult`) and options (`Options`, minus `abortController`, `canUseTool`, `continue`, `cwd`, `forkSession`, `resume`, `resumeSessionAt` and `sessionId`, which the toolkit owns) are the SDK's types. `create` picks the session id itself (`sessionId`), so `Started` comes at once; `send` resumes (`resume`) when no process is live; `fork` resumes with `forkSession`, a fresh `sessionId`, and `resumeSessionAt` set to the `at` of an `Ended`, the last main-thread message uuid of that Run. `send`'s `mode` is `queue` (the default: wait behind a Run in progress) or `steer`: join the Run in progress, pushed with `priority: 'next'`, ahead of anything queued, and stream that Run from its start. With no Run in progress, live or not, a steer runs like any `send`.

It runs the Claude Code the user installed: `claude` on `PATH`, or the Layer's `executable`, or `pathToClaudeCodeExecutable`. It never falls back to the copy bundled in the SDK's platform package; with none installed, the stream fails with `ClaudeError`.

What Claude Code does, found by running it (Claude Code 2.1.332, SDK 0.3.309):

- **Steer echo.** Claude Code echoes a pushed user message only when started with `--replay-user-messages`, which the SDK does not pass, so the toolkit adds it to `extraArgs`. Every pushed message then comes back as an `SDKUserMessageReplay` (`isReplay: true`, our own `uuid`): the Run's prompt right after `system/init` (kept as a `Record`), and a steer (`priority: 'next'`) right after the tool result Claude was waiting on, before its next assistant message, where it took it. That echo is `Steered`. The `result` lists every message it answered in `user_message_uuids`; a steer that comes too late runs as its own turn with its own result, and the Run lasts until that one too.
- **Background work is off.** Every process gets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`. Bash then refuses `run_in_background` ("An unexpected parameter `run_in_background` was provided"), checked by the e2e test; the SDK documents the same switch for background subagents.
- **Cancel** is `interrupt({ cancelQueued: true })` (the runtime takes the argument, the typings do not say so). Claude Code answers with an `error_during_execution` result and the Run ends `cancelled`; with no result within 10 seconds it ends anyway.
- **Requests.** `canUseTool` is never called under `bypassPermissions`. `AskUserQuestion` is a request like any other, answered with `{ behavior: 'allow', updatedInput: { ...input, answers: { [question]: label } } }`. A request's id is the SDK's `options.requestId`.
- **Options are per process.** `send` uses its `options` only when it starts a process; a live one keeps its own, changed with `setModel`, `setPermissionMode` and `applyFlagSettings`. A steer uses only its `prompt`.

## Install

See the [contract](../../../docs/contract.md); this subpath needs `@anthropic-ai/claude-agent-sdk` and `effect`, and Claude Code installed and signed in.

## Exports

### `@kestack/ai-toolkit-v2/harness/claude`

| Export                     | What it does                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `Claude`                   | The Service tag, keyed `@kestack/ai-toolkit-v2/Claude`.                                         |
| `Claude.create`            | Starts a session and its first Run; `Started` first, `Ended` last.                              |
| `Claude.fork`              | Starts a new session from another one, at an `Ended`'s `at` or its end, and runs its first Run. |
| `Claude.send`              | Runs a prompt on a session: live, resumed, queued, or with `mode: 'steer'` joining the Run.     |
| `Claude.respond`           | Answers a pending request with a `PermissionResult`.                                            |
| `Claude.cancel`            | Interrupts the Run in progress.                                                                 |
| `Claude.watch`             | Streams a live session's `Live` state until its process stops.                                  |
| `Claude.live`              | Every live session's `Live` state now.                                                          |
| `Claude.initialization`    | Starts Claude Code in a folder and returns its models, commands, agents, account and styles.    |
| `Claude.contextUsage`      | A live session's context window usage by category.                                              |
| `Claude.mcpServerStatus`   | A live session's MCP servers and their status.                                                  |
| `Claude.setModel`          | Changes a live session's model.                                                                 |
| `Claude.setPermissionMode` | Changes a live session's permission mode.                                                       |
| `Claude.applyFlagSettings` | Merges settings into a live session's flag settings.                                            |
| `Claude.listSessions`      | Lists saved sessions, of one folder or all.                                                     |
| `Claude.sessionInfo`       | Reads one saved session's summary.                                                              |
| `Claude.sessionMessages`   | Reads a saved session's messages.                                                               |
| `Claude.listSubagents`     | Lists the subagents a saved session ran.                                                        |
| `Claude.subagentMessages`  | Reads one subagent's messages.                                                                  |
| `Claude.renameSession`     | Sets a saved session's title.                                                                   |
| `Claude.tagSession`        | Sets or clears a saved session's tag.                                                           |
| `Claude.deleteSession`     | Deletes a saved session.                                                                        |
| `ClaudeError`              | Claude Code could not start, or refused a call.                                                 |
| `NotLive`                  | No process is live for the session.                                                             |

### `@kestack/ai-toolkit-v2/harness/claude/real`

| Export  | What it does                                                                        |
| ------- | ----------------------------------------------------------------------------------- |
| `layer` | The `Claude` Layer, with `linger` (default 30 seconds) and the `executable` to run. |

### `@kestack/ai-toolkit-v2/harness/claude/fake`

| Export       | What it does                                                                                |
| ------------ | ------------------------------------------------------------------------------------------- |
| `layer`      | The `Claude` Layer without Claude Code, replaying recordings; same routing as the real one. |
| `recordings` | The Runs the e2e test recorded from the real Claude Code.                                   |
| `answers`    | The fixed answers of the harness-specific methods, recorded the same way.                   |

## Usage

### Steer a Run in progress

A `send` with `mode: 'steer'` while a Run is in progress joins it: its stream is that Run's, from `Started`, and the message comes back as `Steered` right where Claude Code took it.

```ts
import { Effect, Stream } from 'effect';
import { Claude } from '@kestack/ai-toolkit-v2/harness/claude';
import * as ClaudeReal from '@kestack/ai-toolkit-v2/harness/claude/real';

const program = Effect.gen(function* () {
  const claude = yield* Claude;
  let id = '';
  let steered = false;
  return yield* claude
    .create({
      cwd,
      prompt:
        'Use the Bash tool to run `sleep 3; echo one`. Then reply with the output.',
      options: { model: 'haiku' },
    })
    .pipe(
      Stream.tap((out) => {
        if (out._tag === 'Started') id = out.id;
        if (steered || out._tag !== 'Record' || out.record.type !== 'assistant')
          return Effect.void;
        steered = true;
        return claude
          .send({
            id,
            cwd,
            prompt: 'Also end your reply with the word BANANA.',
            mode: 'steer',
          })
          .pipe(Stream.runDrain, Effect.forkChild);
      }),
      Stream.runCollect,
    );
});

Effect.runPromise(program.pipe(Effect.provide(ClaudeReal.layer())));
```

- The steer's own stream is the same Run, from `Started` to the same `Ended`; its `result` is the SDK's `result` record, listing both message uuids.
- With no Run in progress, the same `send` simply runs, resuming the session if it is not live.
- A reader that stops early does not stop the Run; only `cancel` does.

### Answer a permission request

```ts
claude
  .create({
    cwd,
    prompt: 'Create note.txt containing: hi',
    options: { model: 'haiku' },
  })
  .pipe(
    Stream.tap((out) =>
      out._tag === 'Requested'
        ? claude.respond(id, out.request.options.requestId, {
            behavior: 'allow',
            updatedInput: out.request.input,
          })
        : Effect.void,
    ),
  );
```

- The request is also in `Live.requests` while it waits; it drops when the Run ends or the process stops.

### Test without Claude Code

`ClaudeFake.layer` replays the recording named by the prompt text, else the first one; a recorded request waits for `respond`.

```ts
import * as ClaudeFake from '@kestack/ai-toolkit-v2/harness/claude/fake';

const outs =
  yield * claude.create({ cwd, prompt: 'permission' }).pipe(Stream.runCollect);
// ...
program.pipe(Effect.provide(ClaudeFake.layer({ linger: '5 seconds' })));
```

- Ids are made fresh on every replay; `send`, queueing, steering, `cancel` and `linger` behave as with the real Layer.
- A recording entry `{ exit: 'why' }` makes the fake process die there, to test a Run that ends `failed`.
