# @kestack/cli-platform

What every kestack CLI needs on a computer: its folders, one shared copy of each download, one process per name, and Plugins kept running at the version asked for.

## Big picture

A kestack CLI, such as `ke-connect`, runs on a user's computer for a long time. It needs the same few things whatever it does: folders that follow the platform's rules, downloads kept once for every CLI and checked against their hash, a guarantee that one name runs as one process, and a way to run separate programs, its Plugins, at the version it is told and start them again when they die. This package holds those parts and nothing about what a CLI is for: no sign-in, no cloud, no tunnels.

A Plugin is one Node file named by its sha256. On the CLI's side, `ActorPlugin` is a [Kabuki](../../packages/kabuki/README.md) Actor that downloads it, runs it, swaps it when the wanted version changes, and reports its Plugin State upward through the `Plugins` Capability. On the Plugin's side, `Plugin.make` serves its RPC group on the socket the CLI gave it. The values they pass are [std-toolkit ESchemas](../../toolkits/std-toolkit/src/eschema/README.md), so a newer side reads an older one.

The words are in [CONTEXT.md](./CONTEXT.md), which also says how the folders are laid out.

## Install

```sh
pnpm add @kestack/cli-platform effect @kestack/kabuki @kestack/std-toolkit
```

- `effect`: every operation is an Effect, the Plugin calls are Effect RPC, and Downloads is an Effect service.
- `@kestack/kabuki`: `ActorPlugin` is a Kabuki Actor; only `./plugins` uses it.
- `@kestack/std-toolkit`: the Plugin State and Plugin Status are ESchemas.

## Exports

### `@kestack/cli-platform/files`

| Export            | What it does                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `folders`         | Where a CLI keeps the files of one named copy of itself: data, state, the shared cache, and its runtime.     |
| `names`           | The name of every copy of a CLI with a data folder on this computer.                                         |
| `pluginFolders`   | The data, state and cache folders of one Plugin, inside its CLI's.                                           |
| `socketPath`      | A socket path short enough for a Unix socket, or a named pipe on Windows.                                    |
| `createFolders`   | Makes the folders that are missing, readable by this user alone.                                             |
| `FolderError`     | A folder that could not be made.                                                                             |
| `Downloads`       | The service that keeps one checked copy of each download: `fetch`, `ensure`, `use` and `prune`.              |
| `Downloads.layer` | Downloads kept in a kestack cache folder.                                                                    |
| `DownloadFailed`  | A download that could not be reached, was refused, or broke off; `missing` when a `file:` URL names no file. |
| `HashMismatch`    | A download that is not the file asked for; it is thrown away.                                                |
| `CacheError`      | The cache could not be read or written, or its lock not taken.                                               |

### `@kestack/cli-platform/plugins`

| Export          | What it does                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `ActorPlugin`   | The Kabuki Actor that keeps one Plugin running at the hash, or local file, its parent wants.       |
| `Plugins`       | The Capability a CLI Provides above its Plugins' Actors; each reports its Plugin State through it. |
| `PluginState`   | The ESchema of where a Plugin stands: Downloading, Starting, Running or Crashed.                   |
| `PluginStatus`  | The ESchema of what a running Plugin says about itself.                                            |
| `PluginControl` | The RPC group a CLI asks a Plugin with: `status` and `health`.                                     |
| `PluginEnv`     | The names of the environment variables a Plugin is started with.                                   |
| `PluginPaths`   | Where on its socket a Plugin serves its own group and PluginControl.                               |
| `READY`         | The Node IPC message a Plugin sends once it listens.                                               |

### `@kestack/cli-platform/plugins/contract`

The same `Plugins`, `PluginState`, `PluginStatus`, `PluginControl`, `PluginEnv`, `PluginPaths` and `READY` as `./plugins`, without `ActorPlugin`: nothing in it needs Node, so a browser or a Worker may import it, such as a contract that carries a Plugin State.

### `@kestack/cli-platform/plugins/plugin`

| Export          | What it does                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `Plugin.make`   | Makes the `main` a Plugin's file calls: serves its group where the CLI said, until SIGTERM, then exits 0. |
| `PluginFolders` | The service a Plugin's handlers read their data, state and cache folders from.                            |

### `@kestack/cli-platform/single`

| Export        | What it does                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `single`      | Takes a name by its socket and serves an RPC group there, or answers AlreadyRunning with a client to it. |
| `reach`       | A client to the process holding a name, or NotRunning.                                                   |
| `NotRunning`  | No process holds the name.                                                                               |
| `SingleError` | The socket could not be listened on, nor reached.                                                        |

## Usage

### One process per Connection

`ke-connect serve work` takes the name `work`; a second `serve work` finds it running and asks it for its status instead. Lifted from `src/single/tests/single.test.ts`.

```ts
const Control = RpcGroup.make(
  Rpc.make('status', { success: Schema.Struct({ owner: Schema.String }) }),
);
const handlers = (owner: string) =>
  Control.toLayer({ status: () => Effect.succeed({ owner }) });

const first =
  yield *
  single(path, {
    group: Control,
    handlers: handlers('first'),
  });
// first._tag === 'Acquired': this process serves Control on `path`.
const second =
  yield *
  single(path, {
    group: Control,
    handlers: handlers('second'),
  });
if (second._tag === 'AlreadyRunning') yield * second.client.status(); // { owner: 'first' }
const reached = yield * reach(path, Control); // for `list` and `remove`
```

- The name is held by listening on its socket: the kernel frees it when the process exits, however it exits.
- A socket file left by a process that died is deleted and taken over, once, holding a lock on 127.0.0.1 the kernel frees with the process: of many processes that find it at once, exactly one is `Acquired` and the rest are `AlreadyRunning`.
- `path` comes from `socketPath(folders.runtime, id, 'serve')`.

### Keeping a Plugin running

A CLI places `ActorPlugin` under one of its Actors, hands it the Plugin's folders and socket as Input and the version it wants as Props, and Provides `Plugins` to hear where it stands. Lifted from `src/plugins/tests/plugins.test.ts`.

```ts
const cli = folders({ app: 'connect', name: 'work' });
const Cli = Actor.build(
  Actor.define('Cli', {
    model: Schema.Struct({ wanted: Wanted }),
    message: Schema.TaggedUnion({ Want: { wanted: Wanted } }),
  }),
  {
    init: () => ({ model: { wanted: { hash, url: `${base}/a` } } }),
    children: {
      plugin: {
        actor: ActorPlugin,
        input: () => ({
          name: 'ping',
          folders: pluginFolders(cli, 'ping'),
          socket: socketPath(cli.runtime, connectionId, 'ping'),
        }),
        props: ({ model }) => ({ wanted: model.wanted }),
      },
    },
    on: { Want: ({ wanted }) => ({ model: { wanted } }) },
  },
);
yield *
  Runtime.start(
    Cli,
    Layer.mergeAll(
      Downloads.layer(cli.cache),
      Layer.succeed(Plugins, {
        report: (name, state) => Effect.log(name, state),
      }),
    ),
  );
```

- `wanted` is `{ hash, url }`, downloaded through Downloads and checked against the hash, or `{ file }`, a local file in development. A `file:` URL is copied and checked the same way; one with no file there is Crashed as not on the shelf.
- A new `wanted` downloads while the old Plugin runs; then the old one gets SIGTERM, SIGKILL after ten seconds, and the new one starts once the old process has exited, its finalizers done, and the socket is free. Two never run at once on one Plugin's folders.
- A Plugin that exits is Crashed and started again after 1 s, 2 s, 4 s, up to 60 s; its last 50 lines are in the report and all of them in `<state>/plugins/<name>.log`.
- While a downloaded file runs, it is marked used every day, so `Downloads.prune` from any CLI on the computer keeps it.

### Writing a Plugin

A Plugin's one file serves its group through `Plugin.make`; its handlers read their folders from `PluginFolders`. Lifted from `src/plugins/tests/fixtures/ping.ts`.

```ts
export const Ping = RpcGroup.make(Rpc.make('ping', { success: Schema.String }));

Plugin.make({
  name: 'ping',
  group: Ping,
  layer: Ping.toLayer(
    Effect.gen(function* () {
      const folders = yield* PluginFolders;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => writeFileSync(join(folders.data, 'stopped'), '')),
      );
      return { ping: () => Effect.succeed('pong') };
    }),
  ),
})();
```

- It listens on the socket in `KESTACK_PLUGIN_SOCKET`: its group at `/rpc`, PluginControl at `/control`, both over WebSocket.
- It sends `{ ready: true }` over Node IPC once it listens.
- SIGTERM, or its CLI going away, closes it: the finalizers run and it exits 0.
