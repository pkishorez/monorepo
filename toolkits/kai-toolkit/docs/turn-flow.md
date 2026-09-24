# How a turn flows

A browser starts a Run over RPC, the Harness Host drives a Coding Harness, the harness writes into a Transcript, and the Transcript persists Message rows into the AI Table. Clients read the table. There is no stream to subscribe to.

```
browser ──claudeStart──► rpc/live ──► HarnessHost ──► claude runner ──writes──► Transcript
                                          │  asks                                  │ flush
                                          ▼                                        ▼
                                 interaction-mailbox                        table.messages
                                                                                   │
browser ◄────────────────── subscribeMessages (playground) / your own feed ◄───────┘
```

1. `claudeStart` or `codexStart` inserts a Run and the user Message, marks the Thread `running`, and returns. The client mints `runId`.
2. The runner streams text and thinking deltas into the Transcript. The Transcript joins consecutive deltas of one part and persists the buffer as one Message once it holds `FLUSH_MIN_CHARS` (250) characters of streamed text, at once for any non-streaming part (tool call, tool result, question, approval), and when the Run closes.
3. A permission or question parks in the interaction mailbox and flips the Thread to `waiting-approval` or `waiting-question`. `claudeRespond` or `codexRespond` resolves it; the Resolution is recorded as a user Message. An unanswered request times out with a negative Resolution after `INTERACTION_TIMEOUT_MS`.
4. When the harness ends, the Run becomes `completed`, `failed`, or `cancelled`, and the Thread returns to `idle` or keeps `failed` or `cancelled` until the next Run starts. A Run that has not ended by `RUN_TIMEOUT_MS` is cancelled.
5. At startup the Harness Host runs the Bootstrap Sweep: every Run still `running` or `waiting` becomes `cancelled`, along with its Thread.

## Table layout

`aiTable` declares a primary key and GSI1 to GSI5. GSI1 holds per-Thread feeds (`runs.byThreadUpdate`, `messages.byThreadUpdate`). GSI2 holds global feeds (`threads.byUpdate`, `runs.byUpdate`). GSI3 to GSI5 are declared and unused. Every feed sorts by `_u`, so a client can ask for everything changed since its cursor.

## Upstream boundaries

The persisted part shape is TanStack AI's `UIMessage` part union plus kai-toolkit's custom parts (`COMMON_PARTS`, `CLAUDE_PARTS`, `CODEX_PARTS`), so TanStack's UI packages can render a stored Message. `@tanstack/ai` is a devDependency only; `src/runtime/protocol/parts.test.ts` holds the shape promise at compile time.

Claude runs through `@anthropic-ai/claude-agent-sdk` with partial messages enabled, so text and thinking arrive as deltas. `thinking.budgetTokens` maps to `maxThinkingTokens`. Codex runs through the duplex `codex app-server` JSON-RPC protocol; the `codex` binary must be on `PATH`, or its path supplied through `HarnessHostConfig.codexCommand`.

Tuning values (flush size, timeouts, playground host and port) live in `src/runtime/constants.ts`.
