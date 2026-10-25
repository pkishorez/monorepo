# @kestack/ai-toolkit

Effect-native engine that runs Claude Code and Codex sessions in local folders, keeps every Raw record, and serves one projected Message form over WebSocket

## Big picture

Claude Code and Codex sessions run for minutes, start work that outlives a Turn, and must outlive the browser tab that started them. ai-toolkit is a long-running server on this machine that owns them. It adds folders as Projects, runs Sessions in them on either Coding Harness, stores every whole record the harness emits, and lets any app follow and steer them over one WebSocket API. [`@kestack/connect`](../../apps/connect/README.md) runs it as a Machine (`ke-connect serve`): signed in to Cloud Connect as one User, reached through a tunnel by whoever holds its Machine Key, and called by a browser page only from an origin it allows. [`apps/code`](../../apps/code/README.md) is the first app on it.

The API, `AiApi`, has commands and feeds, in seven groups merged into one: harnesses, projects, sessions, turns, jobs, folders and speech. Commands add and remove Projects, start a Session, and `send` to it: text plus Attachments, and a model or settings that hold from that Turn on. Images go to the agent as images; other files are saved in the Attachments folder, under `<sessionId>/`, and named in the message text. `forkSession` makes a Fork after any finished Turn, its own or one it inherited, copying nothing: its `forkedFrom` names the Session forked and the Turn. `settleSession` and `unsettleSession` Settle a Session and take it back, and sending to it un-settles it; a Session's `activeAt` is when a Turn last started in it, and its `endedAt` when one last ended. `ask` puts an Ask to a Session and leaves it untouched, and `regenerateTitle` writes its Title again. `listFolder` and `createFolder` walk the home folder and make a folder in it, with `git init`, to add as a Project. `skills`, `mcpStatus` and `contextUsage` say what a harness offers and how a Session stands. `backgroundJobs` streams every Session's Background Jobs and `stopBackgroundJob` stops one. `harnesses` says which harnesses run here (`available`, `unavailableReason`), and `harnessBinaries` and `setHarnessBinary` read and set each Harness Binary. `enableSpeechToText` switches Speech to Text on for this Machine, which downloads its model, and `disableSpeechToText` deletes it; `watchSpeechToText` streams how it stands, and `transcribe` turns a clip of audio into text on the Machine itself. The `projects`, `sessions` and `messages` feeds replay every change after a cursor, then stay live.

The client side builds on [`@kestack/rpc-toolkit`](../rpc-toolkit/README.md) for the reconnecting WebSocket and on [`@kestack/std-toolkit`](../std-toolkit/README.md) for the `Ai` Replica, which keeps Projects, Sessions and open Sessions' Messages in step with the server. The engine itself is a tree of [`@kestack/kabuki`](../../packages/kabuki/README.md) Actors over a SQLite store; [docs/kabuki-tree.md](docs/kabuki-tree.md) says what the tree is and why.

The words are in [CONTEXT.md](CONTEXT.md). How the server thinks, Raw records and their projection to Messages, is in [docs/v1-spec.md](docs/v1-spec.md). Decisions are in [docs/adr/](docs/adr/); 0004 (The API is one RpcGroup merged from groups by area), 0011 (Fork Points are Turn ends), 0012 (Background Jobs are live, and agents may start Turns), 0013 (A Turn's facts travel in its stream), 0014 (A Fork reads its history from the original) and 0017 (Speech to Text runs on the Machine) are current, and the others record the design this package replaced.

## Install

```sh
pnpm add @kestack/ai-toolkit effect @kestack/rpc-toolkit @kestack/std-toolkit @kestack/kabuki @tanstack/db
```

- `effect`: the API, its schemas and errors, and the client Layer are Effect values.
- `@kestack/rpc-toolkit`: the WebSocket Transport each Machine's `AiClient` connects through, and `connection`.
- `@kestack/std-toolkit`: entity schemas, the SQLite store, and the Replica behind `Ai` and `AiLive`.
- `@kestack/kabuki`: the engine runs Projects, Sessions and Turns as Actors.
- `@tanstack/db`: the collections the `Ai` Replica fills and Queries read.

`@anthropic-ai/claude-agent-sdk`, `@openai/codex`, `@effect/platform-node` and `sherpa-onnx-node` (Speech to Text) are regular dependencies. Node 24 or newer is required, and a `tar` that reads bzip2 to unpack the Speech to Text model.

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
| `SpeechToTextState`     | Schema of how Speech to Text stands: `Off`, `Downloading` with bytes of total, `Ready`, or `Failed`.     |
| `SpeechToTextNotReady`  | Error: Speech to Text is off, still downloading, or failed on this Machine.                              |
| `TranscriptionFailed`   | Error: the model would not load, or the audio is not 16-bit PCM.                                         |

### `@kestack/ai-toolkit/client`

| Export                 | What it does                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiClient`             | Service holding one Machine's `AiApi` client over its reconnecting WebSocket.                                                                     |
| `AiClient.layer`       | Layer of `AiClient` for a `ws(s)://…/rpc` URL, or a path in a browser, with the Machine Key if given.                                             |
| `MachineAddress`       | Service the app gives: where a Machine's socket is, by Machine id, and its Machine Key, on each connect.                                          |
| `AiClients`            | Service holding every Machine's client by Machine id, one socket each, shared by whatever holds it.                                               |
| `AiClients.layer`      | Layer of `AiClients` opening each Machine's socket at the address `MachineAddress` gives.                                                         |
| `AiClients.make`       | Layer of `AiClients` opening each Machine with a given Layer, for one server or a test.                                                           |
| `AiClients.machine`    | Layer of one Machine's `AiClient` and connection, for everything under it.                                                                        |
| `AiClients.on`         | Runs an Effect that needs `AiClient` against one Machine, by its id.                                                                              |
| `AiClients.stream`     | Runs a Stream that needs `AiClient` against one Machine, its socket held while it runs.                                                           |
| `AiClients.connection` | Stream of one Machine's connection status now and on each change.                                                                                 |
| `connection`           | Stream of the connection status of the `AiClient` in context: `connecting`, `connected` or `reconnecting`.                                        |
| `Ai`                   | The Replica of each Machine's records, keyed by Machine id: `projects`, `sessions` and `messages`.                                                |
| `AiLive`               | How `Ai` syncs: every Project and Session, and a Session's Messages while a Query filters on its id, each Instance over its own Machine's socket. |

### `@kestack/ai-toolkit/server`

For now, what `ke-connect serve` composes the server from; it moves to `@kestack/connect`.

| Export            | What it does                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `server`          | The whole server as one Layer: the Store, the engine, the harnesses and the API on `/rpc`. |
| `DEFAULT_ORIGINS` | The origins a browser page may call from unless told otherwise.                            |
| `Harnesses`       | Service listing the Coding Harnesses that run here.                                        |
| `claude`          | The Claude Code harness.                                                                   |
| `codex`           | The Codex harness.                                                                         |
| `codexTitler`     | Layer writing Titles with Codex.                                                           |
| `makeFakeHarness` | A fake harness for tests, scripted Turn by Turn.                                           |
| `FAKE_SKILLS`     | The skills the fake harness offers.                                                        |
| `makeFakeSpeech`  | A fake Speech to Text for tests.                                                           |

## Usage

### Serve the engine

`server` is the whole server as one Layer, running until its Scope closes. `ke-connect serve` in [`@kestack/connect`](../../apps/connect/README.md) starts it as a Machine, with its files in Connect's folders; a test starts it over a fake harness. Trimmed from `src/server/server.test.ts`.

```ts
import { Effect, Layer } from 'effect';
import { makeFakeHarness, server } from '@kestack/ai-toolkit/server';

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* Layer.build(
      server({
        port: 4590,
        db: '/tmp/ai.db',
        harnesses: makeFakeHarness().layer,
        origins: ['http://localhost:*', 'https://*.app.test'],
      }),
    );
    // ws://127.0.0.1:4590/rpc is up until the Scope closes.
  }),
);
```

- `port: 0` binds any free port; the Layer's `HttpServer` says which.
- With `key`, every request but `/health` must offer the subprotocols `ai-toolkit` and `key.<key>`, page or program; without the key it gets 401, with a wrong one 403. The server answers with `ai-toolkit`, never the key.
- A browser page may call only from an origin in `origins` (`DEFAULT_ORIGINS` unless given: this computer, and `https://*.kishore.app` and `https://*.kishore.computer`); any other page gets 403, and a program that sends no `Origin` is let in.
- `attachments`, `modelsCache` and `speechFolder` say where Attachments, the models.dev copy and the Speech to Text model go; left out, they sit beside the database. `home` is the folder `listFolder` and `createFolder` never leave.
- At start the Bootstrap Sweep ends any Turn the last server left running as interrupted.

### Talk to it from a program

`AiClient.layer` connects to a running server. Every command is an Effect. Trimmed from `src/server/server.test.ts`.

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
- `transcribe({ audio })` takes one whole clip as a `Uint8Array` of 16 kHz mono PCM, each sample 16-bit signed little-endian, and answers its text. It fails `SpeechToTextNotReady` unless `watchSpeechToText` says `Ready`; the model loads on the first clip and stays loaded.
- Commands sent while the socket is down wait for it to come back.
- With `key`, the socket offers the subprotocols `ai-toolkit` and `key.<key>`, since a browser can set no other header on a WebSocket; the server selects `ai-toolkit` once the Machine Key checks out.

### Keep the server's records in an app

An app on every Machine at once places `AiLive` under its Replicas, says where each Machine is, and reads `Ai` through Queries. Lifted from `apps/code/src/app.tsx`, `apps/code/src/shell` and `apps/code/src/replica`.

```ts
import { eq } from '@tanstack/db';
import { Effect, Layer, Schema } from 'effect';
import {
  Ai,
  AiClients,
  AiLive,
  MachineAddress,
} from '@kestack/ai-toolkit/client';
import { Query, Replicas } from '@kestack/std-toolkit/replica';
import { Store } from '@kestack/std-toolkit/replica/idb';

const layer = Layer.mergeAll(
  AiClients.layer.pipe(
    Layer.provide(
      Layer.succeed(MachineAddress, {
        of: (machineId) => Effect.succeed(addressOf(machineId)),
      }),
    ),
  ),
  Layer.unwrap(Effect.sync(() => Store.idb())),
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
- `Ai.get(machineId)` is the Instance of one Machine, with its own IndexedDB database. It syncs over that Machine's own socket, which `AiClients` opens at the address `MachineAddress` gives, so any number of Machines' Instances can be held at once ([ADR 0018](docs/adr/0018-an-app-is-on-every-machine-at-once.md)).
- `AiClients.on(machineId, AiClient.use((api) => api.harnessBinaries()))` makes any other call to one Machine over the same socket.
- The Replica's name carries the projection's version. Pruning the Store to the Machines listed, `store.prune([[Ai, machineIds]])`, deletes older versions and Machines gone alike.
