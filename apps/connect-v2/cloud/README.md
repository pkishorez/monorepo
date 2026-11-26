# @kestack/connect-v2-cloud

Connect Cloud v2 on a Cloudflare Worker: where each Connection reports its Heartbeat, the list of a User's Connections, and which Plugins each one runs

## Big picture

Connect Cloud is the part of Connect that lives in the cloud. `ke-connect`
(in [`@kestack/connect-v2`](../connect/package.json)) sends it a Report on
every Heartbeat and is answered with its Enabled Plugins. Apps, and the web
portal, call its App API to list a User's Connections, rename or remove
one, and turn Plugins on or off for each. The words are in
[CONTEXT.md](CONTEXT.md).

It is a rewrite of v1's cloud in [`@kestack/connect`](../connect/README.md),
with one change of job: v1 told every Connection to run the same Plugins,
v2 lets each Connection's User choose. It keeps every Connection in one
std-toolkit table on D1, checks each caller with auth-toolkit, and serves
Release Files from R2.

The package has four subpaths: `./heartbeat` and `./app` are the two RPC
contracts, `./server` is `serveOver` and `serve` for a host, and `./client`
is `CloudClient`, the App API as an App calls it.

## Usage

### Test it

`pnpm test` runs Connect Cloud over an in-memory SQLite database, calling
it through real RPC clients as `ke-connect` and an App do, with
auth-toolkit's fake Guard saying who signed each call.

```ts
const driver = makeNodeSQLite({ path: ':memory:' });
await Effect.runPromise(
  SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
);

const answer = serveOver({
  guard: fakeGuard.rpc({ as: principal }),
  authInfo: { url: 'https://auth.test' },
  origins: ['https://*.test'],
  driver,
  catalog: {
    code: {
      hash: 'a'.repeat(64),
      url: 'https://files.test/code',
      enabledByDefault: true,
    },
  },
  minConnect: '0.0.9',
});

const response = await answer(new Request('https://connect.test/auth'));
```

- `serveOver` answers `/auth`, `/heartbeat`, `/rpc` and `/releases/…` as one
  `(request) => Promise<Response>`.
- The table must be set up first; a Worker's is set up at deploy.

### Deploy it

`pnpm deploy` runs `alchemy.run.ts`: the Worker at `connect-v2.kishore.app`,
its D1 database `connect-v2-cloud-<stage>`, and an R2 bucket of Release
Files. The Catalog comes from every `../plugins/*/releases.json`, and the
Minimum Connect from `minConnect` in the connect package's `package.json`,
when it names one.
