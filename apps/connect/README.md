# @kestack/connect

Connects a computer to the cloud as a Machine its User reaches from anywhere: the ke-connect command, Cloud Connect on a Cloudflare Worker, and the code App Group Code talks to

## Big picture

A coding agent runs on a computer, but its User wants to reach it from a phone or another laptop. Connect makes the computer a Machine: `ke-connect serve` signs it in to Cloud Connect as its User, opens a tunnel, and reports a Heartbeat with its address and Machine Key. An App lists its User's Machines from Cloud Connect, a Worker with a D1 database at `connect.kishore.app`, then talks to each Machine straight over its one socket.

What a Machine serves comes in App Groups. The `code` App Group keeps Projects and Sessions for [Code](../code/README.md): it runs each Session's Agent through [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md), orders its Turns, stores its Raw records, and sends them to the browser through a [std-toolkit](../../toolkits/std-toolkit/README.md) Replica over [rpc-toolkit](../../toolkits/rpc-toolkit/README.md). Sign-in comes from [auth-toolkit](../../toolkits/auth-toolkit/README.md). Why Connect owns this and ai-toolkit stops at the harness is [root ADR 0011](../../docs/adr/0011-ai-toolkit-stops-at-the-harness-connect-owns-the-rest.md).

Connect keeps its files in the XDG folders under `kestack/`, moved there once from `~/.ai-toolkit`. In development each branch has its own folders, Machine and Cloud Connect, and every App's `pnpm dev` starts or reuses them: see [docs/dev.md](docs/dev.md).

The words are in [CONTEXT.md](CONTEXT.md), the Actors in [docs/kabuki-tree.md](docs/kabuki-tree.md), and the decisions in [docs/adr/](docs/adr/).

## Install

```sh
pnpm add @kestack/connect effect @kestack/kabuki @kestack/std-toolkit @kestack/rpc-toolkit @kestack/auth-toolkit @tanstack/db
npx @kestack/connect serve
```

- `effect`: everything Connect exposes is an Effect value.
- `@kestack/kabuki`: the Machine's Heartbeat and the `code` App Group run as Actors.
- `@kestack/std-toolkit`: the stored records and the Replica an App reads them through.
- `@kestack/rpc-toolkit`: the WebSocket an App reaches a Machine over.
- `@kestack/auth-toolkit`: a Machine signs in to Cloud Connect as its User.
- `@tanstack/db`: the collections the Replica fills.

Node 24 or newer is required.

## Exports

### `./code`

What Code's browser imports: the `code` App Group's API and records, the client and Replica that reach it on each Machine, and Cloud Connect's contract and client.

| Export                   | What it does                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `CodeApi`                | The RPC group of the `code` App Group: its commands and the `projects`, `sessions`, `messages` feeds.         |
| `CodeClient`             | Service holding one Machine's `CodeApi` client over its reconnecting WebSocket.                               |
| `CodeClient.layer`       | Layer of `CodeClient` for a `ws(s)://…/rpc` URL, or a path in a browser, with the Machine Key if given.       |
| `MachineAddress`         | Service the App gives: where a Machine's socket is, by Machine id, and its Machine Key, on each connect.      |
| `CodeClients`            | Service holding every Machine's client by Machine id, one socket each, shared by whatever holds it.           |
| `CodeClients.layer`      | Layer of `CodeClients` opening each Machine's socket at the address `MachineAddress` gives.                   |
| `CodeClients.make`       | Layer of `CodeClients` opening each Machine with a given Layer, for one server or a test.                     |
| `CodeClients.machine`    | Layer of one Machine's `CodeClient` and connection, for everything under it.                                  |
| `CodeClients.on`         | Runs an Effect that needs `CodeClient` against one Machine, by its id.                                        |
| `CodeClients.stream`     | Runs a Stream that needs `CodeClient` against one Machine, its socket held while it runs.                     |
| `CodeClients.connection` | Stream of one Machine's connection status now and on each change.                                             |
| `connection`             | Stream of the connection status of the `CodeClient` in context: `connecting`, `connected` or `reconnecting`.  |
| `CodeReplica`            | The Replica of each Machine's records, keyed by Machine id: `projects`, `sessions` and `messages`.            |
| `CodeReplicaLive`        | How `CodeReplica` syncs: every Project and Session, and a Session's Messages while a Query filters on its id. |
| `FolderListing`          | Schema of a `listFolder` answer: the folder, its parent, up to 100 sub-folders, and if it was cut short.      |
| `FolderEntry`            | Schema of one sub-folder in a listing: its name, whether it is hidden, and whether it is a symlink.           |
| `CreatedFolder`          | Schema of a `createFolder` answer: the new folder's path, and why `git init` failed, if it did.               |
| `WireEntity`             | An entity in encoded form with its meta, as feeds send it and take it back as a cursor.                       |
| `Harness`                | Schema of a harness name: `claude` or `codex`.                                                                |
| `HarnessInfo`            | Schema of one harness: label, settings, default model, and whether its Harness Binary runs.                   |
| `SettingInfo`            | Schema of one harness setting and the choices a picker offers.                                                |
| `ModelInfo`              | Schema of one Language Model: id, name, and release date.                                                     |
| `ProjectSchema`          | Entity schema of a Project.                                                                                   |
| `ProjectValue`           | Plain struct of a Project's fields, as `addProject` returns it.                                               |
| `SessionSchema`          | Entity schema of a Session.                                                                                   |
| `SessionValue`           | Plain struct of a Session's fields, as `startSession` and `forkSession` return it.                            |
| `MessageSchema`          | Entity schema of a Message, the projected form a client reads.                                                |
| `PartSchema`             | Schema of one Message part: text, thinking, tool call, attachment, turn start or end, and more.               |
| `HarnessConfigSchema`    | Entity schema of the Harness Binary path stored for one harness.                                              |
| `HarnessBinary`          | Schema of a harness's Harness Binary: the path set for it and what it resolved to.                            |
| `BinaryInfoSchema`       | Schema of a resolved binary: its path and what `--version` printed.                                           |
| `AttachmentSchema`       | Schema of an Attachment: name, mime type, and base64 data.                                                    |
| `SkillSchema`            | Schema of a Skill: name, description, and an optional argument hint.                                          |
| `AskAnswerSchema`        | Schema of an Ask's answer: `Text`, or `Data` shaped by the given JSON Schema.                                 |
| `BackgroundJobSchema`    | Schema of one Background Job.                                                                                 |
| `BACKGROUND_JOB_KINDS`   | Tuple of Background Job kinds: `shell`, `agent`.                                                              |
| `SessionJobs`            | Schema of one Session's Background Jobs, as the `backgroundJobs` stream sends them.                           |
| `McpServerStatusSchema`  | Schema of one MCP server a Session's Agent is connected to.                                                   |
| `MCP_SERVER_STATES`      | Tuple of MCP server states, such as `connected`, `failed`, `needs-auth`, `pending`.                           |
| `ContextUsageSchema`     | Schema of Context Usage: tokens used, the window size, and rate limits.                                       |
| `SpeechToTextState`      | Schema of how Speech to Text stands: `Off`, `Downloading` with bytes of total, `Ready`, or `Failed`.          |
| `FolderNotFound`         | Error: no folder at the path given.                                                                           |
| `PermissionDenied`       | Error: this user may not read or write the folder.                                                            |
| `FolderExists`           | Error: something is already at the path `createFolder` would make.                                            |
| `InvalidFolderName`      | Error: the name cannot be one new folder.                                                                     |
| `OutsideHome`            | Error: the path, its symlinks resolved, is not inside the home folder.                                        |
| `FolderUnreadable`       | Error: the folder could not be listed, or listing it took too long.                                           |
| `ProjectNotFound`        | Error: no Project with this id.                                                                               |
| `SessionNotFound`        | Error: no Session with this id.                                                                               |
| `UnknownHarness`         | Error: this Machine does not run that harness.                                                                |
| `ModelsUnavailable`      | Error: the harness could not list its models.                                                                 |
| `NotForkable`            | Error: the Session cannot be forked after the Turn asked for.                                                 |
| `AskFailed`              | Error: the harness could not answer the Ask.                                                                  |
| `SkillsUnavailable`      | Error: the harness could not list its Skills.                                                                 |
| `InvalidBinary`          | Error: the path is missing, not executable, or its `--version` failed.                                        |
| `HarnessFailed`          | Error: a harness failed to answer for a live Session.                                                         |
| `SpeechToTextNotReady`   | Error: Speech to Text is off, still downloading, or failed on this Machine.                                   |
| `TranscriptionFailed`    | Error: the model would not load, or the audio is not 16-bit PCM.                                              |
| `CloudApi`               | Cloud Connect's RPC group: a Machine's `Report`, and an App's `List` and `Forget`, for the caller only.       |
| `CloudClient`            | Service holding the `CloudApi` client over HTTP.                                                              |
| `CloudClient.layer`      | Layer of `CloudClient` for Cloud Connect's base URL; the caller's auth signs every call.                      |
| `Machine`                | Schema of a Machine as its User sees it: its last Report and its Last Seen.                                   |
| `MachineReport`          | Schema of what a Machine says of itself on each Heartbeat: id, name, Machine Key, version, status.            |
| `MachineStatus`          | Schema of how far a Machine's tunnel got: installing cloudflared, opening, failed, or up.                     |
| `TunnelCheck`            | Schema of whether a Machine could reach itself at its public address, and when it checked.                    |
| `addressOf`              | The public address a Machine Status is up at, or null.                                                        |
| `MachineForgotten`       | Error: the Machine was forgotten by its User; it must sign out and stop.                                      |
| `MachineTaken`           | Error: another User's Machine already has this id.                                                            |
| `RPC_PATH`               | Cloud Connect's RPC path, `/rpc`.                                                                             |
| `AUTH_PATH`              | The path that answers how a Machine signs in, `/auth`.                                                        |

### `./worker`

| Export          | What it does                                                                   |
| --------------- | ------------------------------------------------------------------------------ |
| `serve`         | Cloud Connect on a Worker's D1 database, as `(request) => Promise<Response>`.  |
| `serveOver`     | The same over any std-toolkit SQLite driver and auth Guard, for tests.         |
| `machinesTable` | The std Table Cloud Connect keeps Machines in, for `SQLite.setup` and deploys. |

### `./node`

| Export   | What it does                                                                           |
| -------- | -------------------------------------------------------------------------------------- |
| `serve`  | Runs Connect as a Machine until stopped: signed in, serving, tunnelled, reporting.     |
| `logout` | Signs out of Cloud Connect and forgets the Machine, keeping its Projects and Sessions. |
| `main`   | Runs the `ke-connect` command on this process's arguments.                             |

### `./dev`

| Export          | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `withConnect`   | An App's `pnpm dev`: makes sure the branch's Connect runs, then runs the App with `CONNECT_URL`. |
| `ensureConnect` | Makes sure the branch's Connect runs, starting it detached if not, and takes a lease on it.      |
| `runConnectDev` | Runs this branch's Cloud Connect under `alchemy dev` and a Machine on it.                        |
| `branchOf`      | The branch a checkout is, and its Cloud Connect's URL, as Portless names them.                   |

## Usage

### Serve a Machine

Run `npx @kestack/connect serve` on a computer, sign in with the device code it prints, and the computer is listed as one of your Machines within a few seconds. `ke-connect serve --help` lists the flags, and `ke-connect logout` forgets the Machine. From code, `serve` from `./node` does the same. Shaped after `src/cli/cli.ts`.

```ts
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { serve } from '@kestack/connect/node';

serve({
  cloud: 'https://connect.kishore.app',
  name: 'Work laptop',
  origins: ['https://my-app.example.com'],
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
```

- It signs in through the Auth Worker that Cloud Connect's `/auth` names, and keeps the Machine's id and Machine Key in `machine.json`.
- It serves the `code` App Group on `ws://127.0.0.1:4590/rpc`, asks every caller for the Machine Key, and opens a cloudflared tunnel.
- Its Heartbeat reports the tunnel's address to Cloud Connect every 15 seconds. A forgotten Machine signs out and stops.

### Talk to a Machine from a browser

An App lists its User's Machines from Cloud Connect, says where each one is through `MachineAddress`, and reads each Machine's records through `CodeReplicaLive`, one Instance per Machine. Trimmed from `src/cli/serve/server.test.ts` and Code's `reach.ts`.

```ts
import { Effect, Layer, Schema } from 'effect';
import { Actor, Runtime } from '@kestack/kabuki';
import { Query, Replicas } from '@kestack/std-toolkit/replica';
import { Store } from '@kestack/std-toolkit/replica/idb';
import {
  addressOf,
  CloudClient,
  CodeClients,
  CodeReplica,
  CodeReplicaLive,
  MachineAddress,
} from '@kestack/connect/code';

const address = Layer.effect(
  MachineAddress,
  Effect.map(CloudClient, (cloud) =>
    MachineAddress.of({
      of: (machineId) =>
        Effect.map(Effect.orDie(cloud.List({})), (machines) => {
          const machine = machines.find(({ id }) => id === machineId)!;
          const url = addressOf(machine.status)!.replace('https', 'wss');
          return { url: `${url}/rpc`, key: machine.key };
        }),
    }),
  ),
);

const Projects = Query.make('Projects', {
  props: Schema.Struct({ machineId: Schema.String }),
  from: ({ props }) => Effect.all({ code: CodeReplica.get(props.machineId) }),
  query:
    (_, { code }) =>
    (q) =>
      q.from({ p: code.projects }),
});

const Root = Actor.build(Actor.define('Root', {}), {
  provides: () => Replicas.layer,
  children: {
    replicas: Replicas.child([CodeReplicaLive]),
    projects: { actor: Projects, props: () => ({ machineId: 'm1' }) },
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
- Each Machine gets its own socket, opened at the address `MachineAddress` gives on each connect, so a Machine back at a new tunnel address is reached there.
- `CodeClients.on(machineId, …)` runs a command, such as `addProject`, against one Machine.

### Run Cloud Connect on a Worker

`serve` from `./worker` is Cloud Connect over a D1 database, signing in through an Auth Worker and letting the listed origins call with credentials. This is `src/cloud/worker/worker.server.ts`, which `alchemy.run.ts` deploys.

```ts
import { serve } from '@kestack/connect/worker';

interface Env {
  readonly AUTH_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly DB: D1Database;
}

let served: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch: (request: Request, env: Env) =>
    (served ??= serve({
      auth: { url: env.AUTH_URL },
      origins: env.ALLOWED_ORIGINS.split(','),
      database: env.DB,
    }))(request),
};
```

- `ALLOWED_ORIGINS` takes comma-separated patterns such as `https://*.kishore.app`.
- Set the D1 table up from `machinesTable` before the first request.
- In this monorepo, `pnpm -F @kestack/connect deploy:prod` deploys it to `connect.kishore.app`.
