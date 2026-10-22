# @kestack/ai-toolkit

Effect-native engine that runs Claude Code and Codex sessions in local folders, keeps every Raw record, and serves one projected Message form over WebSocket

## Big picture

Claude Code and Codex sessions run for minutes, start work that outlives a Turn, and must outlive the browser tab that started them. ai-toolkit is a long-running server on this machine that owns them. It adds folders as Projects, runs Sessions in them on either Coding Harness, stores every whole record the harness emits, and lets any app follow and steer them over one WebSocket API. It is local only, with no sign-in, and a browser page may call it only from an origin it allows. [`apps/code`](../../apps/code/README.md) is the first app on it.

The API, `AiApi`, has commands and feeds, in six groups merged into one: harnesses, projects, sessions, turns, jobs and folders. Commands add and remove Projects, start a Session, and `send` to it: text plus Attachments, and a model or settings that hold from that Turn on. Images go to the agent as images; other files are saved under `~/.ai-toolkit/attachments/<sessionId>/` and named in the message text. `forkSession` makes a Fork after any finished Turn, its own or one it inherited, copying nothing: its `forkedFrom` names the Session forked and the Turn. `settleSession` and `unsettleSession` Settle a Session and take it back, and sending to it un-settles it; a Session's `activeAt` is when a Turn last started in it, and its `endedAt` when one last ended. `ask` puts an Ask to a Session and leaves it untouched, and `regenerateTitle` writes its Title again. `listFolder` and `createFolder` walk the home folder and make a folder in it, with `git init`, to add as a Project. `skills`, `mcpStatus` and `contextUsage` say what a harness offers and how a Session stands. `backgroundJobs` streams every Session's Background Jobs and `stopBackgroundJob` stops one. `harnesses` says which harnesses run here (`available`, `unavailableReason`), and `harnessBinaries` and `setHarnessBinary` read and set each Harness Binary. The `projects`, `sessions` and `messages` feeds replay every change after a cursor, then stay live.

The client side builds on [`@kestack/rpc-toolkit`](../rpc-toolkit/README.md) for the reconnecting WebSocket and on [`@kestack/std-toolkit`](../std-toolkit/README.md) for the `Ai` Replica, which keeps Projects, Sessions and open Sessions' Messages in step with the server. The engine itself is a tree of [`@kestack/kabuki`](../../packages/kabuki/README.md) Actors over a SQLite store.

The words are in [CONTEXT.md](CONTEXT.md). How the server thinks, Raw records and their projection to Messages, is in [docs/v1-spec.md](docs/v1-spec.md). Decisions are in [docs/adr/](docs/adr/); 0004 (The API is one RpcGroup merged from groups by area), 0011 (Fork Points are Turn ends), 0012 (Background Jobs are live, and agents may start Turns), 0013 (A Turn's facts travel in its stream) and 0014 (A Fork reads its history from the original) are current, and the others record the design this package replaced.

## Install

```sh
pnpm add @kestack/ai-toolkit effect @kestack/rpc-toolkit @kestack/std-toolkit @kestack/kabuki @tanstack/db
```

- `effect`: the API, its schemas and errors, and the client Layer are Effect values.
- `@kestack/rpc-toolkit`: the WebSocket Transport `AiClient` connects through, and `connection`.
- `@kestack/std-toolkit`: entity schemas, the SQLite store, and the Replica behind `Ai` and `AiLive`.
- `@kestack/kabuki`: the engine runs Projects, Sessions and Turns as Actors.
- `@tanstack/db`: the collections the `Ai` Replica fills and Queries read.

`@anthropic-ai/claude-agent-sdk`, `@openai/codex` and `@effect/platform-node` are regular dependencies. Node 24 or newer is required. The package also installs the `ai-toolkit` binary.

## Exports

### `@kestack/ai-toolkit/api`

| Export                  | What it does                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `AiApi`                 | The RPC group every app speaks: the commands above and the `projects`, `sessions`, `messages` feeds.     |
| `FolderListing`         | Schema of a `listFolder` answer: the folder, its parent, up to 100 sub-folders, and if it was cut short. |
| `FolderEntry`           | Schema of one sub-folder in a listing: its name, whether it is hidden, and whether it is a symlink.      |
| `CreatedFolder`         | Schema of a `createFolder` answer: the new folder's path, and why `git init` failed, if it did.          |
| `WireEntity`            | An entity in encoded form with its meta, as feeds send it and take it back as a cursor.                  |
| `Harness`               | Schema of a harness name: `claude` or `codex`.                                                           |
| `HarnessInfo`           | Schema of one harness: label, settings, default model, and whether its Harness Binary runs.              |
| `SettingInfo`           | Schema of one harness setting and the choices a picker offers.                                           |
| `ModelInfo`             | Schema of one Language Model: id, name, and release date.                                                |
| `ProjectSchema`         | Entity schema of a Project.                                                                              |
| `ProjectValue`          | Plain struct of a Project's fields, as `addProject` returns it.                                          |
| `SessionSchema`         | Entity schema of a Session.                                                                              |
| `SessionValue`          | Plain struct of a Session's fields, as `startSession` and `forkSession` return it.                       |
| `MessageSchema`         | Entity schema of a Message, the projected form a client reads.                                           |
| `PartSchema`            | Schema of one Message part: text, thinking, tool call, attachment, turn start or end, and more.          |
| `HarnessConfigSchema`   | Entity schema of the Harness Binary path stored for one harness.                                         |
| `HarnessBinary`         | Schema of a harness's Harness Binary: the path set for it and what it resolved to.                       |
| `BinaryInfoSchema`      | Schema of a resolved binary: its path and what `--version` printed.                                      |
| `AttachmentSchema`      | Schema of an Attachment: name, mime type, and base64 data.                                               |
| `SkillSchema`           | Schema of a Skill: name, description, and an optional argument hint.                                     |
| `AskAnswerSchema`       | Schema of an Ask's answer: `Text`, or `Data` shaped by the given JSON Schema.                            |
| `BackgroundJobSchema`   | Schema of one Background Job.                                                                            |
| `BACKGROUND_JOB_KINDS`  | Tuple of Background Job kinds: `shell`, `agent`.                                                         |
| `SessionJobs`           | Schema of one Session's Background Jobs, as the `backgroundJobs` stream sends them.                      |
| `McpServerStatusSchema` | Schema of one MCP server a Session's agent is connected to.                                              |
| `MCP_SERVER_STATES`     | Tuple of MCP server states, such as `connected`, `failed`, `needs-auth`, `pending`.                      |
| `ContextUsageSchema`    | Schema of Context Usage: tokens used, the window size, and rate limits.                                  |
| `FolderNotFound`        | Error: no folder at the path given.                                                                      |
| `PermissionDenied`      | Error: this user may not read or write the folder.                                                       |
| `FolderExists`          | Error: something is already at the path `createFolder` would make.                                       |
| `InvalidFolderName`     | Error: the name cannot be one new folder.                                                                |
| `OutsideHome`           | Error: the path, its symlinks resolved, is not inside the home folder.                                   |
| `FolderUnreadable`      | Error: the folder could not be listed, or listing it took too long.                                      |
| `ProjectNotFound`       | Error: no Project with this id.                                                                          |
| `SessionNotFound`       | Error: no Session with this id.                                                                          |
| `UnknownHarness`        | Error: this server does not run that harness.                                                            |
| `ModelsUnavailable`     | Error: the harness could not list its models.                                                            |
| `NotForkable`           | Error: the Session cannot be forked after the Turn asked for.                                            |
| `AskFailed`             | Error: the harness could not answer the Ask.                                                             |
| `SkillsUnavailable`     | Error: the harness could not list its Skills.                                                            |
| `InvalidBinary`         | Error: the path is missing, not executable, or its `--version` failed.                                   |
| `HarnessFailed`         | Error: a harness failed to answer for a live Session.                                                    |

### `@kestack/ai-toolkit/client`

| Export           | What it does                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `AiClient`       | Service holding the `AiApi` client over one reconnecting WebSocket.                                  |
| `AiClient.layer` | Layer of `AiClient` for a `ws(s)://…/rpc` URL, or a path in a browser.                               |
| `connection`     | Stream of the connection status now and on each change: `connecting`, `connected` or `reconnecting`. |
| `Ai`             | The Replica of the server's records: `projects`, `sessions` and `messages` collections.              |
| `AiLive`         | How `Ai` syncs: every Project and Session, and a Session's Messages while a Query filters on its id. |
| `retired`        | Names of Replicas from older projections, for `Store.idb({ retired })` to delete.                    |

## Usage

### Serve the engine

The `ai-toolkit` binary runs the server on this machine. It keeps its database in SQLite and listens on `127.0.0.1` only.

```sh
pnpm --filter @kestack/ai-toolkit build
node toolkits/ai-toolkit/bin/ai-toolkit.mjs serve --port 4590 --db ~/.ai-toolkit/ai.db \
  --origin 'https://*.tail8a9834.ts.net:*'
# ai-toolkit 0.0.2 on ws://127.0.0.1:4590/rpc
```

- `--port` falls back to `PORT`, then 4590. `--db` defaults to `~/.ai-toolkit/ai.db`.
- A browser page may call the server only from `http://localhost`, `127.0.0.1` or `[::1]` on any port, `https://localhost` and `https://*.localhost` (portless) on any port, and `https://code.kishore.computer` with its subdomains. Each `--origin` adds one: `scheme://host[:port]`, `*.` for any subdomains, `:*` for any port. Any other page gets 403; a program that sends no `Origin` is let in. `server({ origins })` replaces the list.
- `listFolder` and `createFolder` never leave the user's home folder; `server({ home })` sets another.
- Attachments that are not images are saved under `~/.ai-toolkit/attachments/<sessionId>/`.
- At start the Bootstrap Sweep ends any Turn the last server left running as interrupted.
- A harness whose Harness Binary does not run shows as unavailable in `harnesses`; `setHarnessBinary` points it at another path.

### Talk to it from a program

`AiClient.layer` connects to a running server. Every command is an Effect. Trimmed from `src/cli/server/server.test.ts`.

```ts
import { Context, Effect, Layer } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';

const program = Effect.gen(function* () {
  const client = yield* Layer.build(AiClient.layer('ws://127.0.0.1:4590/rpc'));
  const api = Context.get(client, AiClient);

  const project = yield* api.addProject({ path: '/path/to/folder' });
  const session = yield* api.startSession({
    projectId: project.id,
    harness: 'claude',
    model: 'claude-sonnet-4-6',
    settings: {},
    text: 'hi',
    attachments: [],
  });

  yield* api.send({ sessionId: session.id, text: 'again', attachments: [] });
  const fork = yield* api.forkSession({
    sessionId: session.id,
    afterTurnId: null,
  });
  const answer = yield* api.ask({
    sessionId: session.id,
    question: 'why?',
    schema: null,
  });
  return { fork, answer };
});

Effect.runPromise(Effect.scoped(program));
```

- `startSession` returns the Session already running its first message. `send` starts a Turn, or steers the running one.
- `forkSession` with `afterTurnId: null` forks after the latest finished Turn; it fails with `NotForkable` while none has finished.
- A Fork's own `messages` start after its Fork Point. Before them comes the history up to the end of `forkedFrom.turnId`, read from `forkedFrom.sessionId`: if that Session's own Messages hold the Message of that Turn with a `turnEnded` part, its history and then its own Messages up to that one, ordered by id; if not, the Turn was one it inherited, so the same is read from its own `forkedFrom.sessionId` instead.
- `ask` answers from the Session's context without adding to it. With a JSON Schema in `schema`, the answer is `Data` of that shape.
- Commands sent while the socket is down wait for it to come back.

### Keep the server's records in an app

An app places `AiLive` under its Replicas and reads `Ai` through Queries. Lifted from `apps/code/src/app.tsx`, `apps/code/src/shell` and `apps/code/src/replica`.

```ts
import { eq } from '@tanstack/db';
import { Effect, Layer, Schema } from 'effect';
import { Ai, AiClient, AiLive, retired } from '@kestack/ai-toolkit/client';
import { Query, Replicas } from '@kestack/std-toolkit/replica';
import { Store } from '@kestack/std-toolkit/replica/idb';

const layer = Layer.mergeAll(
  AiClient.layer('http://127.0.0.1:4590/rpc'),
  Layer.unwrap(Effect.sync(() => Store.idb({ retired }))),
);

const ReplicasLive = Replicas.child([AiLive]);

export const Messages = Query.make('Messages', {
  props: Schema.Struct({ sessionId: Schema.String }),
  from: () => Effect.all({ ai: Ai.get() }),
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ m: ai.messages })
        .where(({ m }) => eq(m.sessionId, props.sessionId)),
});
```

- `layer` goes to the app's runtime; `ReplicasLive` is a child of its root Actor, which provides `Replicas.layer`.
- Projects and Sessions sync whole while the app runs. A Session's Messages sync only while a Query filters on its `sessionId`.
- Each feed reopens after a reconnect from the newest entity it passed on, so nothing is missed or sent twice.
- The Replica's name carries the projection's version; `retired` lets the IndexedDB Store delete older ones.
