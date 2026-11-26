# @kestack/connect-v2

Connects a computer to the cloud so its User reaches it from anywhere: ke-connect signs in, opens a Cloudflare tunnel, reports its Heartbeat and runs the Plugins Connect Cloud enables

## Big picture

Connect v2 is `ke-connect` rewritten as three Kabuki Actors, Connect, Tunnel and Plugin, over eight Services, each with a contract and a real Layer. The story, the tree of States and Messages, and the words are in [CONTEXT.md](CONTEXT.md). Connect Cloud is its own package, [`@kestack/connect-v2-cloud`](../cloud/README.md), whose Heartbeat contract Connect calls.

Connect publishes only Effect RPC, over HTTP or WebSocket, at `/<plugin>/<sha256>/rpc`. A Plugin is its own package that imports `@kestack/connect-v2/plugin` and serves one RPC group; anything else it offers, such as an MCP server, it runs and hands out through that group. The link's paths and close codes are `@kestack/connect-v2/link`, for an App that dials a Plugin.

Everything a Connection keeps is in its data folder, `kestack/connect-v2/connections/<name>/`, apart from v1's: `ke-connect.db` (the Connection and its Sign-in, in the same table format as v1), its backups, and each Plugin's own data, which Connect never deletes unless asked. Downloads, cloudflared among them, are kept once per computer in the shared cache.

## Usage

### Run it

```sh
pnpm -F @kestack/connect-v2 build
node apps/connect-v2/connect/bin/ke-connect.mjs serve --cloud https://connect-v2.kishore.app
node apps/connect-v2/connect/bin/ke-connect.mjs list
node apps/connect-v2/connect/bin/ke-connect.mjs stop
node apps/connect-v2/connect/bin/ke-connect.mjs remove main
```

- `serve [name]` runs a Connection, `main` unless named; a second `serve` of the same name only says where the first runs.
- `remove <name>` stops it, removes it from Connect Cloud, signs out, and deletes its files but keeps its Plugins' data; `--delete-data` deletes that too.
- `ke-connect` exits 75 when Connect Cloud finds it older than its Minimum Connect.

### Write a Plugin

A Plugin is one Node file that serves an RPC group. Trimmed from `src/tests/fixtures/echo.ts`, which the tests run as a real Plugin.

```ts
import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { PluginFolders, serve } from '@kestack/connect-v2/plugin';

export const Echo = RpcGroup.make(
  Rpc.make('remember', {
    payload: { text: Schema.String },
    success: Schema.Array(Schema.String),
  }),
);

serve({
  name: 'echo',
  group: Echo,
  layer: Echo.toLayer({
    remember: ({ text }) =>
      Effect.map(PluginFolders, ({ data }) => keepIn(data, text)),
  }),
});
```

- `serve` reads the socket and folders `ke-connect` started it with, answers the group at `/rpc` over WebSocket (JSON) and HTTP (NDJSON), the same framing as rpc-toolkit's clients, and tells `ke-connect` it is ready.
- `PluginFolders` is its own data, state and cache folders. Its data folder is the same for every Release.
- It stops on SIGTERM, or when `ke-connect` goes away.

### Test it

`pnpm test` runs the Actors against a fake world of every Service (`src/actor-connect/tests/`), real Plugin processes behind the real Server (`src/tests/link.test.ts`), and `ke-connect` end to end (`src/tests/ke-connect.test.ts`): separate processes, a Connect Cloud v2 in the test process, an Auth Worker that approves every device code, and a fake cloudflared.
