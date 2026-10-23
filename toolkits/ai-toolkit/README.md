# @kestack/ai-toolkit

Effect-native engine that runs Claude Code and Codex sessions in local folders, keeps every Raw record, and serves one projected Message form over WebSocket

## Big picture

Claude Code and Codex sessions run for minutes, start work that outlives a Turn, and must outlive the browser tab that started them. ai-toolkit is a long-running server on this machine that owns them. It adds folders as Projects, runs Sessions in them on either Coding Harness, stores every whole record the harness emits, and lets any app follow and steer them over one WebSocket API. It runs as a Machine: signed in to the Machines Backend as one User, reached through a tunnel by whoever holds its Machine Key, and called by a browser page only from an origin it allows. [`apps/code`](../../apps/code/README.md) is the first app on it.

The API, `AiApi`, has commands and feeds, in six groups merged into one: harnesses, projects, sessions, turns, jobs and folders. Commands add and remove Projects, start a Session, and `send` to it: text plus Attachments, and a model or settings that hold from that Turn on. Images go to the agent as images; other files are saved under `~/.ai-toolkit/attachments/<sessionId>/` and named in the message text. `forkSession` makes a Fork after any finished Turn, its own or one it inherited, copying nothing: its `forkedFrom` names the Session forked and the Turn. `settleSession` and `unsettleSession` Settle a Session and take it back, and sending to it un-settles it; a Session's `activeAt` is when a Turn last started in it, and its `endedAt` when one last ended. `ask` puts an Ask to a Session and leaves it untouched, and `regenerateTitle` writes its Title again. `listFolder` and `createFolder` walk the home folder and make a folder in it, with `git init`, to add as a Project. `skills`, `mcpStatus` and `contextUsage` say what a harness offers and how a Session stands. `backgroundJobs` streams every Session's Background Jobs and `stopBackgroundJob` stops one. `harnesses` says which harnesses run here (`available`, `unavailableReason`), and `harnessBinaries` and `setHarnessBinary` read and set each Harness Binary. The `projects`, `sessions` and `messages` feeds replay every change after a cursor, then stay live.

The client side builds on [`@kestack/rpc-toolkit`](../rpc-toolkit/README.md) for the reconnecting WebSocket and on [`@kestack/std-toolkit`](../std-toolkit/README.md) for the `Ai` Replica, which keeps Projects, Sessions and open Sessions' Messages in step with the server. The engine itself is a tree of [`@kestack/kabuki`](../../packages/kabuki/README.md) Actors over a SQLite store.

The words are in [CONTEXT.md](CONTEXT.md). How the server thinks, Raw records and their projection to Messages, is in [docs/v1-spec.md](docs/v1-spec.md). Decisions are in [docs/adr/](docs/adr/); 0004 (The API is one RpcGroup merged from groups by area), 0011 (Fork Points are Turn ends), 0012 (Background Jobs are live, and agents may start Turns), 0013 (A Turn's facts travel in its stream) and 0014 (A Fork reads its history from the original) are current, and the others record the design this package replaced.

## Install

```sh
pnpm add @kestack/ai-toolkit effect @kestack/rpc-toolkit @kestack/std-toolkit @kestack/kabuki @kestack/auth-toolkit @tanstack/db
```

- `effect`: the API, its schemas and errors, and the client Layer are Effect values.
- `@kestack/rpc-toolkit`: the WebSocket Transport `AiClient` connects through, and `connection`.
- `@kestack/std-toolkit`: entity schemas, the SQLite store, and the Replica behind `Ai` and `AiLive`.
- `@kestack/kabuki`: the engine runs Projects, Sessions and Turns as Actors.
- `@kestack/auth-toolkit`: Machines sign in to the Machines Backend, which checks every call with its Guard.
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

| Export           | What it does                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `AiClient`       | Service holding the `AiApi` client over one reconnecting WebSocket.                                   |
| `AiClient.layer` | Layer of `AiClient` for a `ws(s)://…/rpc` URL, or a path in a browser, with the Machine Key if given. |
| `connection`     | Stream of the connection status now and on each change: `connecting`, `connected` or `reconnecting`.  |
| `Ai`             | The Replica of each Machine's records, keyed by Machine id: `projects`, `sessions` and `messages`.    |
| `AiLive`         | How `Ai` syncs: every Project and Session, and a Session's Messages while a Query filters on its id.  |
| `retired`        | Names of Replicas no longer read, for `Store.idb({ retired })` to delete.                             |

### `@kestack/ai-toolkit/machines`

| Export             | What it does                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `MachinesApi`      | The RPC group the Machines Backend answers: `Report`, `List` and `Forget`, for the caller only. |
| `MachineReport`    | Schema of what a Machine says of itself on each Heartbeat: id, name, address, Machine Key.      |
| `Machine`          | Schema of a Machine as its User sees it: its last Report and its Last Seen.                     |
| `TunnelCheck`      | Schema of whether a Machine could reach itself at its public address, and when it checked.      |
| `AuthInfo`         | Schema of how a Machine signs in to the Backend: the Auth Worker's URL, or Local mode.          |
| `MachineForgotten` | Error: the Machine, or its Sign-in, was forgotten; it must sign out and stop.                   |
| `MachineTaken`     | Error: another User's Machine already has this id.                                              |
| `RPC_PATH`         | The RPC's path on the Backend, `/rpc`.                                                          |
| `AUTH_PATH`        | The path that answers `AuthInfo`, `/auth`.                                                      |

### `@kestack/ai-toolkit/machines/client`

| Export                 | What it does                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- |
| `MachinesClient`       | Service holding the `MachinesApi` client over HTTP.                               |
| `MachinesClient.layer` | Layer of `MachinesClient` for the Backend's base URL; the caller's auth signs it. |
| `authInfo`             | Effect asking the Backend at a base URL how a Machine signs in to it: `AuthInfo`. |

### `@kestack/ai-toolkit/machines/backend`

| Export          | What it does                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- |
| `serve`         | The Machines Backend on a D1 binding, as `(request) => Promise<Response>` for a Worker.      |
| `serveOver`     | The same over any std-toolkit SQLite driver and auth Guard, for tests and local runs.        |
| `machinesTable` | The `machines` std Table it keeps Machines in, for `SQLite.setup`, `D1.table` and snapshots. |

## Usage

### Serve the engine

The `ai-toolkit` binary runs the server on this machine as a Machine: signed in to the Machines Backend, listening on `127.0.0.1`, reachable through a Cloudflare quick tunnel, and reporting itself on every Heartbeat.

```sh
pnpm --filter @kestack/ai-toolkit build
node toolkits/ai-toolkit/bin/ai-toolkit.mjs serve --port 4590 --db ~/.ai-toolkit/ai.db
# ai-toolkit 0.0.2 on ws://127.0.0.1:4590/rpc
# database /Users/ada/.ai-toolkit/ai.db
# Machine studio (8ce2bd84-…)
# signed in as ada@example.com to https://api-code.kishore.app
# Tunnel at https://details-bathrooms-starring-volume.trycloudflare.com

node toolkits/ai-toolkit/bin/ai-toolkit.mjs logout --db ~/.ai-toolkit/ai.db
```

In this repo, `pnpm dev` serves against `apps/code`'s dev Backend, asking portless for its address, with the database `~/.ai-toolkit/dev.db`; `pnpm dev:local` does the same for a Backend in Local mode, as `dev@kishore.computer`, with `~/.ai-toolkit/dev-local.db`, since one database file is one User's. Any flag after them is passed on, such as `pnpm dev --name studio`.

```sh
pnpm --filter code dev                  # the app and its Backend, signing in with auth.kishore.computer
pnpm --filter @kestack/ai-toolkit dev   # this Machine, against that Backend
```

- `--backend` falls back to `AI_TOOLKIT_BACKEND`, then `https://api-code.kishore.app`. `serve` asks it how to sign in: through its Auth Worker, by Device Login the first time (the link and code are printed; `o` opens the browser), the Sign-in kept in the database file for later runs; or, for a Backend in Local mode, as the User `--as <email>` names. `--as` is refused by a Backend with an Auth Worker, and a Local mode Backend needs it.
- One database file is one Machine of one User. The first run makes the Machine: a random id, a Machine Key that never changes, and the host's name, which `--name` replaces and keeps. Another User signing in on the file is refused: use another `--db`.
- With a Machine Key, every request but `/health` must offer the subprotocols `ai-toolkit` and `key.<key>`, page or program; without the key it gets 401, with a wrong one 403. The server answers with `ai-toolkit`, never the key.
- The tunnel is `cloudflared tunnel --url http://127.0.0.1:<port>`; the binary is downloaded on first use. Every `--heartbeat` seconds (15 unless given) the Machine checks `<tunnel>/health` and reports its id, name, address, key, version and that check to the Backend. Three failed checks in a row restart cloudflared, and the new address is reported at once.
- A Machine forgotten from the app signs out, which revokes its Sign-in, and stops. A revoked Sign-in closes the tunnel and asks to sign in again in the terminal.
- `logout` asks the Backend to Forget the Machine (a failure is only logged), signs out and forgets the Machine here, keeping its Projects and Sessions: the next `serve` is a new Machine.
- `--port` falls back to `PORT`, then 4590. `--db` defaults to `~/.ai-toolkit/ai.db`.
- A browser page may call the server only from `http://localhost`, `127.0.0.1` or `[::1]` on any port, `https://localhost` and `https://*.localhost` (portless) on any port, `https://code.kishore.app`, and `https://code.kishore.computer` with its subdomains. Each `--origin` adds one: `scheme://host[:port]`, `*.` for any subdomains, `:*` for any port. Any other page gets 403; a program that sends no `Origin` is let in. `server({ origins })` replaces the list, and `server({ key })` asks for a Machine Key.
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
  const client = yield* Layer.build(
    AiClient.layer('ws://127.0.0.1:4590/rpc', { key: machineKey }),
  );
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
- With `key`, the socket offers the subprotocols `ai-toolkit` and `key.<key>`, since a browser can set no other header on a WebSocket; the server selects `ai-toolkit` once the Machine Key checks out.

### Run the Machines Backend on a Worker

The app's Worker reads its env and hands it to `serve`; Alchemy makes the `machines` table with `D1.table(machinesTable)` at deploy. Trimmed from `src/machines/backend/backend.ts`.

```ts
import { serve } from '@kestack/ai-toolkit/machines/backend';

interface Env {
  readonly AUTH_URL?: string; // the Auth Worker; unset with AUTH_LOCAL
  readonly AUTH_LOCAL?: string; // any value: Local mode
  readonly SITE_ORIGIN: string; // the app's origin, e.g. https://code.example.com
  readonly DB: D1Database;
}

let served: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch: (request: Request, env: Env) =>
    (served ??= serve({
      auth: env.AUTH_LOCAL ? { local: true } : { url: env.AUTH_URL! },
      site: env.SITE_ORIGIN,
      database: env.DB,
    }))(request),
};
```

- `GET /auth` answers the `AuthInfo` given, to anyone, so a Machine needs only the Backend's address. `POST /rpc` is `MachinesApi`, behind auth-toolkit's Guard.
- Only `SITE_ORIGIN` may call `/rpc` with credentials; its preflight is answered.
- `Report` refuses an id another User reported with `MachineTaken`. After `Forget`, a Report from that id, or from the Sign-in it last reported with, is refused `MachineForgotten` ([ADR 0016](docs/adr/0016-a-forgotten-machine-stays-forgotten.md)).

### Keep the server's records in an app

An app places `AiLive` under its Replicas and reads `Ai` through Queries. Lifted from `apps/code/src/app.tsx`, `apps/code/src/shell` and `apps/code/src/replica`.

```ts
import { eq } from '@tanstack/db';
import { Effect, Layer, Schema } from 'effect';
import { Ai, AiClient, AiLive, retired } from '@kestack/ai-toolkit/client';
import { Query, Replicas } from '@kestack/std-toolkit/replica';
import { Store } from '@kestack/std-toolkit/replica/idb';

const layer = Layer.mergeAll(
  AiClient.layer('https://machine.example.com/rpc', { key: machineKey }),
  Layer.unwrap(Effect.sync(() => Store.idb({ retired }))),
);

const ReplicasLive = Replicas.child([AiLive]);

export const Messages = Query.make('Messages', {
  props: Schema.Struct({ machineId: Schema.String, sessionId: Schema.String }),
  from: ({ props }) => Effect.all({ ai: Ai.get(props.machineId) }),
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
- `Ai.get(machineId)` is the Instance of one Machine, with its own IndexedDB database. Every Instance syncs through the one `AiClient` in the layer, so hold only the Instance of the Machine that client reaches.
- The Replica's name carries the projection's version; `retired` lets the IndexedDB Store delete older ones, and the unkeyed ones from before Machines.
