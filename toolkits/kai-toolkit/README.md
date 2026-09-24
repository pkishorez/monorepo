# kai-toolkit

Effect-native runtime for stateful coding-agent harnesses whose Messages live in a StdTable

## Big picture

Claude Code and Codex turns run for minutes, pause for questions and approvals, and must outlive the browser tab that started them. Streaming the answer back over the request that started it ties the Run to one connection. kai-toolkit removes that coupling: a client starts a Run over RPC and gets nothing back but `void`; every fact about the Run lands as an immutable Message row in the AI Table, and clients read the table through whatever feed they already have.

The package builds on `std-toolkit`. The AI Table is a `StdTable` with `threads`, `runs`, and `messages` entities, so any std-toolkit database adapter (memory, SQLite, DynamoDB, IndexedDB) can store it, and `std-toolkit/sync` can mirror it into a browser. The playground uses `rpc-toolkit/rpc/websocket-client` to keep its subscriptions alive; a production app can pair the same RPC with its own transport and feed.

Vocabulary is in [CONTEXT.md](CONTEXT.md), the decisions are in [docs/adr/](docs/adr/), and the lifecycle of one turn, the table layout, and the harness SDK boundaries are in [docs/turn-flow.md](docs/turn-flow.md).

## Install

```sh
pnpm add kai-toolkit effect
```

- `effect` (peer, required): the RPC contract, layers, schemas, and the StdTable service all come from Effect.

`std-toolkit`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex`, and `@effect/platform-node` are regular dependencies and install with the package. Node 24 or newer is required.

## Exports

### `kai-toolkit/rpc`

| Export                             | What it does                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `AiRpc`                            | The public RPC group: `cancelRun`, `claudeStart`, `claudeRespond`, `codexStart`, `codexRespond`.            |
| `CommonRpc`                        | Group holding `cancelRun` alone.                                                                            |
| `ClaudeRpc`                        | Group holding `claudeStart` and `claudeRespond`.                                                            |
| `CodexRpc`                         | Group holding `codexStart` and `codexRespond`.                                                              |
| `AiRpcError`                       | Schema union of every error the RPC group can return.                                                       |
| `RunConflict`                      | Error: a Run with this `runId` already exists with different input.                                         |
| `ThreadBusy`                       | Error: the Thread already has an Active Run.                                                                |
| `ThreadNotFound`                   | Error: no Thread with this id.                                                                              |
| `RunNotFound`                      | Error: no Run with this id.                                                                                 |
| `RequestNotFound`                  | Error: the Run has no pending Interaction Request with this id.                                             |
| `HarnessFailed`                    | Error: the harness could not start or ended abnormally.                                                     |
| `CLAUDE_MODELS`                    | Tuple of Claude model ids accepted by `claudeStart`.                                                        |
| `CODEX_MODELS`                     | Tuple of Codex model ids accepted by `codexStart`.                                                          |
| `RUN_STATUSES`                     | Tuple of Run statuses: `running`, `waiting`, `completed`, `failed`, `cancelled`.                            |
| `THREAD_STATUSES`                  | Tuple of Thread statuses: `idle`, `running`, `waiting-question`, `waiting-approval`, `cancelled`, `failed`. |
| `COMMON_PARTS`                     | Names of custom parts shared by every harness.                                                              |
| `COMMON_PARTS.ERROR`               | Part name `agent.error`, an error surfaced during the Run.                                                  |
| `COMMON_PARTS.PERMISSION_REQUEST`  | Part name `agent.permission.request`, an approval the harness is waiting on.                                |
| `COMMON_PARTS.PERMISSION_RESOLVED` | Part name `agent.permission.resolved`, the Resolution to an approval.                                       |
| `COMMON_PARTS.QUESTION`            | Part name `agent.question`, a question the harness asked the user.                                          |
| `COMMON_PARTS.FILE_CHANGED`        | Part name `agent.file.changed`, a file the harness edited.                                                  |
| `CLAUDE_PARTS`                     | Names of Claude-only custom parts.                                                                          |
| `CLAUDE_PARTS.SUBAGENT`            | Part name `claude.subagent`, a subagent's activity.                                                         |
| `CLAUDE_PARTS.COMPACTION`          | Part name `claude.compaction`, a context compaction event.                                                  |
| `CODEX_PARTS`                      | Names of Codex-only custom parts.                                                                           |
| `CODEX_PARTS.PLAN`                 | Part name `codex.plan`, a plan update.                                                                      |
| `CODEX_PARTS.COMMAND`              | Part name `codex.command`, a shell command Codex ran or wants to run.                                       |
| `CODEX_PARTS.MCP`                  | Part name `codex.mcp`, an MCP tool call.                                                                    |
| `CODEX_PARTS.REQUEST_RESOLVED`     | Part name `codex.request.resolved`, the Resolution to a Codex request.                                      |
| `CUSTOM_PART_NAMES`                | Tuple of every custom part name across the three maps above.                                                |

### `kai-toolkit/rpc/live`

| Export              | What it does                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `AiRpcLive`         | Server-side handler bundle for `AiRpc`.                                                                                                 |
| `AiRpcLive.layer`   | Layer of `AiRpc` handlers; takes an optional `HarnessHostConfig` and requires the AI Table's `StdTableService<'kai-toolkit'>`.          |
| `HarnessHost`       | Service with `start`, `cancel`, `resolveClaude`, and `resolveCodex`, for callers that skip RPC.                                         |
| `HarnessHost.layer` | Layer that builds the host, runs the Bootstrap Sweep, and cancels live Runs on shutdown; accepts a config and optional harness runners. |

### `kai-toolkit/table`

| Export          | What it does                                                                             |
| --------------- | ---------------------------------------------------------------------------------------- |
| `aiTable`       | The `StdTable` named `kai-toolkit` with its primary key and GSI1 to GSI5.                |
| `threads`       | Thread entity with a `byUpdate` feed on GSI2.                                            |
| `runs`          | Run entity keyed under its Thread, with `byThreadUpdate` on GSI1 and `byUpdate` on GSI2. |
| `messages`      | Message entity keyed under its Run, with `byThreadUpdate` on GSI1.                       |
| `ThreadSchema`  | Entity schema for a Thread row.                                                          |
| `RunSchema`     | Entity schema for a Run row.                                                             |
| `MessageSchema` | Entity schema for a Message row.                                                         |
| `MESSAGE_ROLES` | Tuple of Message roles: `system`, `user`, `assistant`.                                   |

### `kai-toolkit/client`

| Export             | What it does                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `toUiMessages`     | Folds ordered Message rows of one Run and role into turns and joins streamed text and thinking.                                    |
| `toUiConversation` | Folds rows into turns, pairs each question with its Resolution and tool activity, and groups non-prose parts into activity blocks. |

### `kai-toolkit/playground`

| Export                  | What it does                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `AiPlaygroundRpc`       | Demo-only group: `createThread`, `subscribeThreads`, `subscribeMessages`.                             |
| `AiPlaygroundServerRpc` | `AiRpc` merged with `AiPlaygroundRpc`; the group the Playground Server serves.                        |
| `PlaygroundFailed`      | Error returned by the playground calls.                                                               |
| `makePlaygroundSync`    | Builds `threads` and `messages` synced collections over a playground client using `std-toolkit/sync`. |

The `kai-toolkit` binary exposes `kai-toolkit serve --port 3001`, which runs the Playground Server against the current directory.

## Usage

### Serve the AI RPC over HTTP with in-memory storage

`AiRpcLive.layer()` needs one thing from the application: the AI Table's StdTable service, built from `aiTable` with any std-toolkit adapter. Trimmed from `src/cli/playground-server.ts`.

```ts
import { createServer } from 'node:http';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import { defaultBroadcaster } from 'std-toolkit/core';
import { Memory } from 'std-toolkit/db/memory';
import { AiRpc } from 'kai-toolkit/rpc';
import { AiRpcLive } from 'kai-toolkit/rpc/live';
import { aiTable } from 'kai-toolkit/table';

const storage = Layer.merge(Memory.make(aiTable).layer, defaultBroadcaster);

const handlers = AiRpcLive.layer({ hostId: 'my-host' }).pipe(
  Layer.provide(storage),
);

const rpc = RpcServer.layerHttp({ group: AiRpc, path: '/rpc' }).pipe(
  Layer.provide(handlers),
  Layer.provide(RpcSerialization.layerJson),
);

export const server = HttpRouter.serve(rpc).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  Layer.provide(NodeServices.layer),
);
```

- Every RPC returns `void`. Threads, Runs, and Messages appear in the table; nothing is observed through the RPC.
- Thread creation stays with the application: insert into `threads` yourself. The playground adds `createThread` only for the demo.
- Building the layer runs the Bootstrap Sweep, and closing its scope cancels every live Run.
- Codex needs the `codex` binary on `PATH`, or `HarnessHostConfig.codexCommand`.

### Run a turn and read its Messages from the table

`HarnessHost` can be driven without RPC. Insert a Thread, start a Run, then read what the Transcript persisted. Lifted from `src/runtime/host/host.test.ts`.

```ts
import { Effect, Layer } from 'effect';
import { defaultBroadcaster } from 'std-toolkit/core';
import { Memory } from 'std-toolkit/db/memory';
import { HarnessHost } from 'kai-toolkit/rpc/live';
import { aiTable, messages, runs, threads } from 'kai-toolkit/table';

const storage = Layer.merge(Memory.make(aiTable).layer, defaultBroadcaster);
const host = HarnessHost.layer({ hostId: 'test' }).pipe(
  Layer.provideMerge(storage),
);

const program = Effect.gen(function* () {
  const harness = yield* HarnessHost;
  yield* threads.insert({
    id: 't1',
    harness: 'claude',
    cwd: '/tmp',
    status: 'idle',
    activeRunId: null,
    data: { type: 'claude', sessionId: null },
  });
  yield* harness.start({
    harness: 'claude',
    threadId: 't1',
    runId: 'r1',
    message: { id: 'u1', content: 'hi' },
    model: 'claude-sonnet-4-6',
    options: {},
  });
  const run = yield* runs.get({ threadId: 't1', id: 'r1' });
  const stored = yield* messages.query(
    'byThreadUpdate',
    { pk: { threadId: 't1' }, '>=': null },
    { limit: 10 },
  );
  return { run: run?.value, rows: stored.items.map((item) => item.value) };
}).pipe(Effect.provide(host), Effect.scoped);
```

- `start` returns as soon as the Run and user Message are inserted; poll `runs.get` until `finishedAt` is set, or watch `messages.byThreadUpdate`.
- Run configuration (model, thinking, permission mode) is stored on each Run, so later turns on the same Thread may pick different settings.
- The test swaps the real runners for a stub through `HarnessHost.layer(config, { claude, codex })`.

### Mirror the playground into a browser and render turns

The docs demo connects over WebSocket, syncs `threads` and `messages` into live collections, and folds rows into a conversation. Trimmed from `apps/docs/src/demos/kai-toolkit/client/client.ts`.

```ts
import { Context, Effect, Layer, Scope } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { toUiConversation } from 'kai-toolkit/client';
import {
  AiPlaygroundServerRpc,
  makePlaygroundSync,
} from 'kai-toolkit/playground';
import {
  layerWebSocketProtocol,
  RpcConnection,
} from 'rpc-toolkit/rpc/websocket-client';

const boot = Effect.gen(function* () {
  const context = yield* Layer.build(
    layerWebSocketProtocol({
      url: 'ws://127.0.0.1:3001/rpc',
      serialization: RpcSerialization.layerJson,
    }),
  );
  const connection = Context.get(context, RpcConnection);
  const api = yield* RpcClient.make(AiPlaygroundServerRpc).pipe(
    Effect.provide(
      Layer.succeed(
        RpcClient.Protocol,
        Context.get(context, RpcClient.Protocol),
      ),
    ),
  );
  const sync = makePlaygroundSync({
    api,
    keepSubscribed: connection.keepSubscribed,
    name: 'kai-toolkit-playground',
  });
  return { api, sync };
});

const { api, sync } = await Effect.runPromise(
  boot.pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe())),
);

const runId = crypto.randomUUID();
await Effect.runPromise(
  api.claudeStart({
    threadId,
    runId,
    message: { id: crypto.randomUUID(), content: 'hello' },
    model: 'claude-sonnet-4-6',
    options: {},
  }),
);

// later, with rows from sync.messages ordered by createdAt
const conversation = toUiConversation(rows);
```

- `subscribeThreads` and `subscribeMessages` page from a cursor, so a reconnect resumes where the collection left off.
- `keepSubscribed` from rpc-toolkit restarts each subscription after the socket reconnects.
- `toUiConversation` joins streamed text split across rows and pairs questions with their Resolutions; `sync.messages` rows must be ordered by `createdAt` first.
- `sync.dispose()` tears the collections down.
