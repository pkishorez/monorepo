# @kestack/connect

Connects a computer to the cloud as a Connection its User reaches from anywhere: the ke-connect command, Cloud Connect on a Cloudflare Worker, and the code Plugin Code talks to

## Big picture

A coding agent runs on a computer, but its User wants to reach it from a phone or another laptop. Connect makes the computer a Connection: `ke-connect serve` signs it in to Cloud Connect as its User, opens a tunnel, and reports a Heartbeat with its address and Connection Key. An App lists its User's Connections from Cloud Connect, a Worker with a D1 database at `connect.kishore.app`, then talks to each Connection straight through its tunnel, at `/<plugin>/rpc`.

`ke-connect` itself stays small and rarely changes. What a Connection serves comes in Plugins: separate programs it runs, each downloaded at the version Cloud Connect names in its answer to every Heartbeat, and swapped for a new one while the tunnel stays up, through [`@kestack/cli-platform`](../../platforms/cli-platform/README.md). The Connection checks the Connection Key and passes each Plugin's requests to that Plugin's own socket without reading them. The `code` Plugin keeps Projects and Sessions for [Code](../code/README.md): it runs each Session's Agent through [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md), with the Claude Code or Codex installed on the computer and as one of its Harness Accounts, orders its Turns, stores its Raw records, and sends them to the browser through a [std-toolkit](../../toolkits/std-toolkit/README.md) Replica over [rpc-toolkit](../../toolkits/rpc-toolkit/README.md). Sign-in comes from [auth-toolkit](../../toolkits/auth-toolkit/README.md). Why Connect owns this and ai-toolkit stops at the harness is [root ADR 0011](../../docs/adr/0011-ai-toolkit-stops-at-the-harness-connect-owns-the-rest.md).

Each Connection has a name on its computer, `main` unless given, and keeps its files in its own folders, as cli-platform lays them out; one name runs as one process. In development each branch has its own Connection, `dev-<branch>`, and its own Cloud Connect, and every App's `pnpm dev` starts or reuses them: see [docs/dev.md](docs/dev.md).

The words are in [CONTEXT.md](CONTEXT.md), the Actors in [docs/kabuki-tree.md](docs/kabuki-tree.md), and the decisions in [docs/adr/](docs/adr/).

## Install

```sh
pnpm add @kestack/connect effect @kestack/kabuki @kestack/std-toolkit @kestack/rpc-toolkit @kestack/auth-toolkit @tanstack/db
npx @kestack/connect serve
```

- `effect`: everything Connect exposes is an Effect value.
- `@kestack/kabuki`: a Connection and the `code` Plugin run as Actors.
- `@kestack/std-toolkit`: the stored records and the Replica an App reads them through.
- `@kestack/rpc-toolkit`: the WebSocket an App reaches a Connection over.
- `@kestack/auth-toolkit`: a Connection signs in to Cloud Connect as its User.
- `@tanstack/db`: the collections the Replica fills.

Node 24 or newer is required. Sessions run the agents installed on the computer, which Connect does not bring: install [Claude Code](https://claude.com/claude-code) or Codex (`npm install -g @openai/codex`) and sign in with `claude auth login` or `codex login`.

## Exports

### `./code`

What Code's browser imports: the `code` Plugin's API and records, and the client and Replica that reach it on each Connection.

Every value an RPC sends is an ESchema, so the newer side reads what an older one sends; the older side fails with `VersionGap`, from `./cloud`, naming which side it is.

| Export                   | What it does                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodeApi`                | The RPC group of the `code` Plugin: its commands and the `projects`, `sessions`, `messages` feeds.                                                   |
| `CodeClient`             | Service holding one Connection's `CodeApi` client over its reconnecting WebSocket.                                                                   |
| `CodeClient.layer`       | Layer of `CodeClient` for a `ws(s)://…/code/rpc` URL, or a path in a browser, with the Connection Key if given.                                      |
| `ConnectionAddress`      | Service the App gives: where a Connection's socket is, by Connection id, and its Connection Key, on each connect.                                    |
| `CodeClients`            | Service holding every Connection's client by Connection id, one socket each, shared by whatever holds it.                                            |
| `CodeClients.layer`      | Layer of `CodeClients` opening each Connection's socket at the address `ConnectionAddress` gives.                                                    |
| `CodeClients.make`       | Layer of `CodeClients` opening each Connection with a given Layer, for one server or a test.                                                         |
| `CodeClients.connection` | Layer of one Connection's `CodeClient` and its socket, for everything under it.                                                                      |
| `CodeClients.on`         | Runs an Effect that needs `CodeClient` against one Connection, by its id.                                                                            |
| `CodeClients.stream`     | Runs a Stream that needs `CodeClient` against one Connection, its socket held while it runs.                                                         |
| `CodeClients.link`       | Stream of one Connection's Link now and on each change.                                                                                              |
| `link`                   | Stream of the Link of the `CodeClient` in context: `linking`, `linked` or `relinking`.                                                               |
| `CodeReplica`            | The Replica of each Connection's records, keyed by Connection id: `projects`, `sessions` and `messages`.                                             |
| `CodeReplicaLive`        | How `CodeReplica` syncs: every Project and Session, and a Session's Messages while a Query filters on its id.                                        |
| `FolderListing`          | ESchema of a `listFolder` answer: the folder, its parent, up to 100 sub-folders, and if it was cut short.                                            |
| `FolderEntry`            | ESchema of one sub-folder in a listing: its name, whether it is hidden, and whether it is a symlink.                                                 |
| `CreatedFolder`          | ESchema of a `createFolder` answer: the new folder's path, and why `git init` failed, if it did.                                                     |
| `WireEntity`             | ESchema of an entity in encoded form with its meta, as feeds send it and take it back as a cursor.                                                   |
| `Harness`                | Schema of a harness name: `claude` or `codex`.                                                                                                       |
| `HarnessInfo`            | ESchema of one Harness Account as a new Session offers it: its harness, name, settings, default model, and whether its binary runs.                  |
| `SettingInfo`            | ESchema of one harness setting and the choices a picker offers.                                                                                      |
| `ModelInfo`              | Schema of one Language Model: id, name, and release date.                                                                                            |
| `ProjectSchema`          | Entity schema of a Project.                                                                                                                          |
| `ProjectValue`           | `ProjectSchema.schema`: a Project with its version, as `addProject` returns it; an older Connect's reply reads as it is now.                         |
| `SessionSchema`          | Entity schema of a Session.                                                                                                                          |
| `SessionValue`           | `SessionSchema.schema`: a Session with its version, as `startSession` and `forkSession` return it; an older Connect's reply reads as it is now.      |
| `MessageSchema`          | Entity schema of a Message, the projected form a client reads.                                                                                       |
| `PartSchema`             | Schema of one Message part: text, thinking, tool call, attachment, turn start or end, and more.                                                      |
| `HarnessAccountSchema`   | Entity schema of a Harness Account: its harness, name, binary and config folder.                                                                     |
| `HarnessAccountInfo`     | ESchema of a Harness Account as set, whether it is its harness's Default Account, the config folder it really uses, and what its binary resolved to. |
| `BinaryInfoSchema`       | Schema of a resolved binary: its path and what `--version` printed.                                                                                  |
| `AttachmentSchema`       | Schema of an Attachment: name, mime type, and base64 data.                                                                                           |
| `SkillSchema`            | Schema of a Skill: name, description, and an optional argument hint.                                                                                 |
| `AskAnswerSchema`        | Schema of an Ask's answer: `Text`, or `Data` shaped by the given JSON Schema.                                                                        |
| `BackgroundJobSchema`    | Schema of one Background Job.                                                                                                                        |
| `BACKGROUND_JOB_KINDS`   | Tuple of Background Job kinds: `shell`, `agent`.                                                                                                     |
| `SessionJobs`            | ESchema of one Session's Background Jobs, as the `backgroundJobs` stream sends them.                                                                 |
| `AgentQuestionSchema`    | Schema of an Agent Question: its id, one to four Items, and when it was asked.                                                                       |
| `QuestionItemSchema`     | Schema of one Item of an Agent Question: header, question, options, and whether it takes several, its own answer, or a secret.                       |
| `QuestionOptionSchema`   | Schema of one choice of an Item: its label and what choosing it means.                                                                               |
| `QuestionAnswerSchema`   | Schema of an answer to an Agent Question: by Item id, the labels chosen, then what was typed.                                                        |
| `SessionQuestions`       | ESchema of one Session's Agent Questions, as the `agentQuestions` stream sends them.                                                                 |
| `McpServerStatusSchema`  | Schema of one MCP server a Session's Agent is connected to.                                                                                          |
| `MCP_SERVER_STATES`      | Tuple of MCP server states, such as `connected`, `failed`, `needs-auth`, `pending`.                                                                  |
| `ContextUsageSchema`     | Schema of Context Usage: tokens used, the window size, and rate limits.                                                                              |
| `SpeechToTextState`      | ESchema of how Speech to Text stands: `Off`, `Downloading` with bytes of total, `Ready`, or `Failed`.                                                |
| `FolderNotFound`         | Error: no folder at the path given.                                                                                                                  |
| `PermissionDenied`       | Error: this user may not read or write the folder.                                                                                                   |
| `FolderExists`           | Error: something is already at the path `createFolder` would make.                                                                                   |
| `InvalidFolderName`      | Error: the name cannot be one new folder.                                                                                                            |
| `OutsideHome`            | Error: the path, its symlinks resolved, is not inside the home folder.                                                                               |
| `FolderUnreadable`       | Error: the folder could not be listed, or listing it took too long.                                                                                  |
| `ProjectNotFound`        | Error: no Project with this id.                                                                                                                      |
| `SessionNotFound`        | Error: no Session with this id.                                                                                                                      |
| `UnknownAccount`         | Error: this Connection has no Harness Account with that id.                                                                                          |
| `ModelsUnavailable`      | Error: the harness could not list its models.                                                                                                        |
| `NotForkable`            | Error: the Session cannot be forked after the Turn asked for.                                                                                        |
| `AskFailed`              | Error: the harness could not answer the Ask.                                                                                                         |
| `SkillsUnavailable`      | Error: the harness could not list its Skills.                                                                                                        |
| `InvalidBinary`          | Error: the path is missing, not executable, or its `--version` failed.                                                                               |
| `InvalidAccount`         | Error: a Harness Account has no name or no config folder, is unknown, or is a Default Account to remove.                                             |
| `HarnessFailed`          | Error: a harness failed to answer for a live Session.                                                                                                |
| `SpeechToTextNotReady`   | Error: Speech to Text is off, still downloading, or failed on this Connection.                                                                       |
| `TranscriptionFailed`    | Error: the model would not load, or the audio is not 16-bit PCM.                                                                                     |

### `./cloud`

What an App imports to reach Cloud Connect: its client, and the Connections it lists.

| Export              | What it does                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CloudClient`       | Service holding the `CloudApi` client over HTTP.                                                                                   |
| `CloudClient.layer` | Layer of `CloudClient` for Cloud Connect's base URL; the caller's auth signs every call.                                           |
| `Connection`        | ESchema of a Connection as its User sees it: its last Report, its Last Seen, each Plugin's wanted version, and the latest Connect. |
| `ConnectionStatus`  | ESchema of how far a Connection's tunnel got: installing cloudflared, opening, failed, or up.                                      |
| `addressOf`         | The public address a Connection Status is up at, or null.                                                                          |
| `VersionGap`        | Error of every `CodeClient` and `CloudClient` call that failed because one side is older: `client` or `server`.                    |
| `authInfo`          | How a Connection signs in to the Cloud Connect at a base URL, from its `/auth`; fails when it cannot be asked.                     |

### `./worker`

| Export             | What it does                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `serve`            | Cloud Connect on a Worker's D1 database, and the Plugins' files from its R2 bucket. |
| `serveOver`        | The same over any std-toolkit SQLite driver and auth Guard, for tests.              |
| `connectionsTable` | The std Table Cloud Connect keeps Connections in, for `SQLite.setup` and deploys.   |

### `./dev`

| Export          | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `withConnect`   | An App's `pnpm dev`: makes sure the branch's Connect runs, then runs the App with `CONNECT_URL`. |
| `ensureConnect` | Makes sure the branch's Connect runs, starting it detached if not, and takes a lease on it.      |
| `runConnectDev` | Runs this branch's Cloud Connect under `alchemy dev` and a Connection on it.                     |
| `branchOf`      | The branch a checkout is, and its Cloud Connect's URL, as Portless names them.                   |

## Usage

### Serve a Connection

Install Claude Code or Codex first. Run `npx @kestack/connect serve` on a computer, sign in with the device code it prints, and the computer is listed as one of your Connections within a few seconds. `ke-connect` with no command opens a wizard that builds one. The commands, as `src/connection/tests/connection.test.ts` runs them:

```sh
ke-connect serve                 # the Connection `main`
ke-connect serve work --port 0   # another one, `work`, on any free port
ke-connect serve work            # `work is already running at https://….trycloudflare.com`
ke-connect list                  # every Connection: running or not, its address, its last start
ke-connect remove work           # stops it, forgets it in Cloud Connect, signs out, deletes its folders
```

- It signs in through the Auth Worker that Cloud Connect's `/auth` names, and keeps the Connection's id, Connection Key and Cloud Connect in `connection.json`; serving it against another Cloud Connect is refused.
- It runs each Plugin Cloud Connect names, passes `/<plugin>/rpc` to it, asks every caller for the Connection Key, and opens a cloudflared tunnel to its port.
- Its Heartbeat reports the tunnel's address and each Plugin State every 15 seconds. A forgotten Connection signs out and stops.
- `--plugin code=<file>` runs a Plugin from a file instead, for development.

### Talk to a Connection from a browser

An App lists its User's Connections from Cloud Connect, says where each one is through `ConnectionAddress`, and reads each Connection's records through `CodeReplicaLive`, one Instance per Connection. Trimmed from `src/plugins/code/serve/tests/serve.test.ts` and Code's `reach.ts`.

```ts
import { Effect, Layer, Schema } from 'effect';
import { Actor, Runtime } from '@kestack/kabuki';
import { Query, Replicas } from '@kestack/std-toolkit/replica';
import { Store } from '@kestack/std-toolkit/replica/idb';
import { addressOf, CloudClient } from '@kestack/connect/cloud';
import {
  CodeClients,
  CodeReplica,
  CodeReplicaLive,
  ConnectionAddress,
} from '@kestack/connect/code';

const address = Layer.effect(
  ConnectionAddress,
  Effect.map(CloudClient, (cloud) =>
    ConnectionAddress.of({
      of: (connectionId) =>
        Effect.map(Effect.orDie(cloud.List({})), (connections) => {
          const connection = connections.find(({ id }) => id === connectionId)!;
          const url = addressOf(connection.status)!.replace('https', 'wss');
          return { url: `${url}/code/rpc`, key: connection.key };
        }),
    }),
  ),
);

const Projects = Query.make('Projects', {
  props: Schema.Struct({ connectionId: Schema.String }),
  from: ({ props }) =>
    Effect.all({ code: CodeReplica.get(props.connectionId) }),
  query:
    (_, { code }) =>
    (q) =>
      q.from({ p: code.projects }),
});

const Root = Actor.build(Actor.define('Root', {}), {
  provides: () => Replicas.layer,
  children: {
    replicas: Replicas.child([CodeReplicaLive]),
    projects: { actor: Projects, props: () => ({ connectionId: 'm1' }) },
  },
});

Runtime.start(
  Root,
  Layer.mergeAll(
    Store.idb(),
    CodeClients.layer.pipe(
      Layer.provide(address),
      Layer.provide(CloudClient.layer('https://connect.kishore.app')),
    ),
  ),
);
```

- `CloudClient` calls are signed by the App's auth-toolkit `browser()` Accounts, provided above it.
- Each Connection gets its own socket, opened at the address `ConnectionAddress` gives on each connect, so a Connection back at a new tunnel address is reached there.
- `CodeClients.on(connectionId, …)` runs a command, such as `addProject`, against one Connection.

### Run Cloud Connect on a Worker

`serve` from `./worker` is Cloud Connect over a D1 database, signing in through an Auth Worker, letting the listed origins call with credentials, telling every Connection which Plugins to run and which Connect is the latest, and serving the Plugins' files. Shaped after `src/cloud/worker/worker.server.ts`, which `alchemy.run.ts` deploys.

```ts
import { serve } from '@kestack/connect/worker';

interface Env {
  readonly AUTH_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly PLUGINS?: string;
  readonly CONNECT_VERSION?: string;
  readonly DB: D1Database;
  readonly PLUGIN_FILES?: R2Bucket;
}

let served: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch: (request: Request, env: Env) =>
    (served ??= serve({
      auth: { url: env.AUTH_URL },
      origins: env.ALLOWED_ORIGINS.split(','),
      database: env.DB,
      plugins: env.PLUGINS ? JSON.parse(env.PLUGINS) : {},
      ...(env.CONNECT_VERSION ? { connectVersion: env.CONNECT_VERSION } : {}),
      ...(env.PLUGIN_FILES ? { files: env.PLUGIN_FILES } : {}),
    }))(request),
};
```

- `ALLOWED_ORIGINS` takes comma-separated patterns such as `https://*.kishore.app`.
- `PLUGINS` is `{"code":{"hash":"<sha256>","url":"<where to download it>"}}`; `pnpm build:plugin` makes `dist/plugin/code.mjs` and prints its sha256.
- `GET /plugins/<name>/<sha256>.mjs` answers that file from `files`, cached for good; anything else there is 404.
- `CONNECT_VERSION` is the latest `ke-connect`; an App tells a Connection that runs an older one to update.
- Set the D1 table up from `connectionsTable` before the first request.
- In this monorepo, `pnpm -F @kestack/connect build:plugin && pnpm -F @kestack/connect deploy:prod` deploys it to `connect.kishore.app`: the deploy uploads `code.mjs` to the Stage's R2 bucket, unless it is there, then points `PLUGINS` at it, and sets `CONNECT_VERSION` from `package.json`.
