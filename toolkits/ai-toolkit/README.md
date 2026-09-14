# ai-toolkit

Effect RPC for long-running Claude Code and Codex turns, executed through
TanStack AI `chat()`.

## Vocabulary

- A **harness** is the stateful coding process: `claude` or `codex`.
- A **model** is the model selected for one run inside that harness. It is not
  an adapter, process, thread, or session.
- A **thread** is the application's stable conversation and working directory.
- A **run** is one complete user turn, including permission and question waits.
- A **session id** is the harness-owned resume handle. It is never a thread id.

## Invariants

- One turn is one run. A question suspends that run; it does not create a
  continuation run.
- Output is detachable and replayable. Answers and cancellation are separate,
  idempotent RPC calls.
- Run ids are minted by the client.
- Every permission/question wait and every run has a timeout.
- A run belongs to one host. A durable `RunLog` implementation must reject a
  claim held by another host, fail orphaned runs in `recover(hostId)`, and fail
  expired waiting runs in `sweep(hostId, waitingBefore)`.
- The AI table stores only threads, runs, and completed messages. Partial AG-UI
  chunks belong in `RunLog`, not in the table.

## Public modules

```ts
import { AiRpc } from 'ai-toolkit/rpc';
import { AiRpcLive, RunLog } from 'ai-toolkit/rpc/live';
import { aiTable, threads, runs, messages } from 'ai-toolkit/table';
```

`AiRpc` contains four common calls (`watchRun`, `watchThread`, `cancelRun`,
`getThread`) and the harness-specific calls (`claudeStart`, `claudeRespond`,
`codexStart`, `codexRespond`). Claude and Codex response types intentionally do
not share a reduced approval type.

`AiRpcLive.layer({ hostId })` requires two application-provided layers:

1. `StdTableService<'ai-toolkit'>`, created from the exported `aiTable` with a
   std-toolkit database adapter.
2. `RunLog`, whose durable implementation owns replay, tailing, host claims,
   startup orphan recovery, and the persisted side of TTL expiry. The host
   calls `sweep` every `sweepIntervalMs` (one minute by default) using
   `waitingTtlMs` (15 minutes by default). Live latches still use their own
   per-request timeout.

For local development, `AiRpcLive.memory({ hostId })` supplies the run log:

```ts
import { Layer } from 'effect';
import { Memory } from 'std-toolkit/db/memory';
import { AiRpcLive } from 'ai-toolkit/rpc/live';
import { aiTable } from 'ai-toolkit/table';

const AiLive = AiRpcLive.memory({ hostId: 'local' }).pipe(
  Layer.provide(Memory.make(aiTable).layer),
);
```

Thread creation remains application-controlled through the exported `threads`
entity. Run configuration is stored on each run, so successive turns may choose
different models, reasoning effort, and access levels.

## Upstream boundaries

TanStack AI's `BaseTextAdapter` currently also requires `model` and
`structuredOutput`; both harness adapters implement that current surface.
TanStack's custom-event union is closed, so ai-toolkit performs one documented
cast at each `chat()` boundary and exports its own narrowing `AgentChunk` type.

Claude uses `@anthropic-ai/claude-agent-sdk`. Its current thinking control is
`maxThinkingTokens`, so the RPC's `thinking.budgetTokens` maps to that field.
Codex uses the duplex `codex app-server` JSON-RPC protocol, not
`codex exec --json`. The Codex binary must be available on `PATH`, or supplied
with `codexCommand`. The current app-server approval response carries only its
decision, not a denial reason; ai-toolkit retains that reason in the
`codex.request.resolved` event even though it cannot forward it to Codex.

`codex app-server generate-ts` and `generate-json-schema` emit the complete
experimental protocol, but neither emits Effect Schema. The Codex adapter
therefore keeps a narrow Effect schema for only the notifications it consumes;
the pure translator and recorded fixtures are the compatibility boundary.
