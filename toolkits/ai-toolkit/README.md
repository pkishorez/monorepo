# ai-toolkit

Effect-native runtime for long-running Claude Code and Codex turns. A harness
writes into a Transcript, the Transcript persists Message rows into the AI
Table, and clients read the table. There is no stream to subscribe to.

## Vocabulary

See `CONTEXT.md` for the full glossary. The short version:

- A **Coding Harness** is the stateful coding process: `claude` or `codex`.
- A **Thread** is the application's conversation and working directory. It
  carries a live **Thread Status**: `idle`, `running`, `waiting-question`,
  `waiting-approval`, `cancelled`, or `failed`.
- A **Run** is one complete user turn, including permission and question
  waits, with its own lifecycle status.
- A **Message** is one immutable flush of a Run's Transcript. A long answer is
  several Messages; `toUiConversation` folds them back into turns.
- A **Transcript** is the only surface a harness writes through.

## How a turn flows

```
browser ──claudeStart──► rpc/live ──► host ──► claude runner ──writes──► Transcript
                                                 │  asks                    │ flush every 200ms
                                                 ▼                          ▼
                                        interaction-mailbox           table.messages
                                                                            │
browser ◄────────────────────── subscribeMessages / sync ◄──────────────────┘
```

1. `claudeStart` or `codexStart` inserts a Run and the user Message, marks the
   Thread `running`, and returns.
2. The runner streams deltas into the Transcript. Every 200ms, or at once for a
   question or approval, the buffered parts become one Message row.
3. A permission or question parks in the mailbox and flips the Thread to
   `waiting-approval` or `waiting-question`. `claudeRespond` or `codexRespond`
   resolves it; the Resolution is recorded as a user Message.
4. When the harness ends, the Run gets `completed`, `failed`, or `cancelled`,
   and the Thread returns to `idle` or keeps the failure until the next Run.
5. At startup the host runs the Bootstrap Sweep: every Run still `running` or
   `waiting` becomes `cancelled`, along with its Thread.

## Public modules

```ts
import { AiRpc, COMMON_PARTS } from 'ai-toolkit/rpc';
import { AiRpcLive } from 'ai-toolkit/rpc/live';
import { aiTable, threads, runs, messages } from 'ai-toolkit/table';
import { toUiConversation } from 'ai-toolkit/client';
import {
  AiPlaygroundServerRpc,
  makePlaygroundSync,
} from 'ai-toolkit/playground';
```

`AiRpc` holds `cancelRun` plus the harness calls `claudeStart`,
`claudeRespond`, `codexStart`, and `codexRespond`. Nothing is observed through
RPC; every fact is a row in the AI Table.

`AiRpcLive.layer()` needs one application-provided layer, the
`StdTableService<'ai-toolkit'>` built from the exported `aiTable` with any
std-toolkit database adapter:

```ts
import { Layer } from 'effect';
import { Memory } from 'std-toolkit/db/memory';
import { AiRpcLive } from 'ai-toolkit/rpc/live';
import { aiTable } from 'ai-toolkit/table';

const AiLive = AiRpcLive.layer().pipe(
  Layer.provide(Memory.make(aiTable).layer),
);
```

Thread creation stays application-controlled through the exported `threads`
entity. Run configuration is stored on each Run, so successive turns may choose
different models, reasoning effort, and access levels.

## Table layout

GSI1 holds per-Thread feeds (`runs.byThreadUpdate`, `messages.byThreadUpdate`).
GSI2 holds global feeds (`threads.byUpdate`, `runs.byUpdate`). GSI3 to GSI5 are
declared and unused. Every feed sorts by `_u`, so a client can ask for
everything changed since its cursor.

## Playground

`ai-toolkit serve --port 3001` starts the Playground Server: memory storage,
the AI RPC, and the demo-only Playground RPC on one HTTP endpoint at `/rpc`.
Threads run in the directory the server was started from. Tuning values such
as the flush interval live in `src/runtime/constants.ts`.

## Upstream boundaries

The persisted part shape is TanStack AI's `UIMessage` part union plus
ai-toolkit's custom parts, so TanStack's UI packages can render a stored
Message. `@tanstack/ai` is a devDependency only; `parts.test.ts` holds the
shape promise at compile time.

Claude uses `@anthropic-ai/claude-agent-sdk` with partial messages enabled, so
text and thinking arrive as deltas. `thinking.budgetTokens` maps to
`maxThinkingTokens`. Codex uses the duplex `codex app-server` JSON-RPC protocol.
The Codex binary must be on `PATH`, or supplied through `codexCommand`.
