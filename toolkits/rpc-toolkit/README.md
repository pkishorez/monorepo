# rpc-toolkit

Effect RPC and HttpApi Cannotations, WebSocket clients, and Cloudflare runtime and deployment integrations

## Big picture

Effect RPC and Effect HttpApi give you middleware, but every app re-invents the same layer on top: a declaration on an endpoint that says how it may be called, a server half that checks it, a client half that attaches credentials. rpc-toolkit names that layer a Cannotation and ships it once for each transport. The declaration lives in shared contract code; the implementations stay on their own side of the wire.

The same pressure shows up at runtime. Streaming RPC over Cloudflare Durable Objects only pays off with hibernation, and hibernation breaks streams unless the server checkpoints them and the client restarts them after a reconnect. The `rpc/cloudflare` and `rpc/websocket-client` subpaths are the two halves of that fix, and the `alchemy` subpaths deploy them as one unit. Cannotation and browser entry points never import Cloudflare or Alchemy.

Vocabulary is in [CONTEXT.md](CONTEXT.md) and the decisions behind the shape are in [docs/adr/](docs/adr/). A full contract, server, worker, and browser example is in [docs/websocket-example.md](docs/websocket-example.md); the package layout and migration checklist are in [docs/integration-migration.md](docs/integration-migration.md). Long-form guides for the two runtime subpaths are their module READMEs: [hibernating-rpc](src/rpc/cloudflare/hibernating-rpc/README.md) and [websocket-client](src/rpc/websocket-client/README.md).

## Install

```sh
pnpm add rpc-toolkit effect
```

- `effect` (peer, required): every subpath builds on `effect/unstable/rpc` or `effect/unstable/httpapi`.
- `alchemy` (peer, optional): needed only by `rpc/cloudflare/alchemy/*`, which wraps Alchemy's Cloudflare resources.

## Exports

### `rpc-toolkit/rpc/cannotation`

| Export             | What it does                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannotation`      | Namespace holding the RPC flavour of Cannotation.                                                                                           |
| `Cannotation.make` | Builds a Declaration for `Rpc` and `RpcGroup` targets; the result carries `with`, `get`, `layer`, `clientLayer`, `middleware`, and `value`. |

### `rpc-toolkit/http/cannotation`

| Export             | What it does                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannotation`      | Namespace holding the HttpApi flavour of Cannotation.                                                                                                                       |
| `Cannotation.make` | Same shape as the RPC flavour over `HttpApiEndpoint` and `HttpApiGroup`, plus a `security` option that feeds OpenAPI and hands the credential to the server implementation. |

### `rpc-toolkit/rpc/invocation`

| Export           | What it does                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `InvocationKind` | Context reference set by the server to `fresh` or `replay`; middleware reads it to skip admission on Hibernation Replay. |

### `rpc-toolkit/rpc/websocket-client`

Long-form guide: [src/rpc/websocket-client/README.md](src/rpc/websocket-client/README.md).

| Export                   | What it does                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `layerWebSocketProtocol` | Layer that provides an `RpcClient.Protocol` over a WebSocket, plus `RpcConnection` and `RpcClient.ConnectionHooks`. |
| `resolveWebSocketUrl`    | Turns a relative or `http(s)` URL into the `ws(s)` URL the browser should open.                                     |
| `RpcConnection`          | Service exposing `connectionStatus`, `keepSubscribed`, and the raw connection hooks.                                |
| `connectionStatus`       | Stream of `connecting`, `connected`, or `reconnecting`, deduplicated and primed with the current value.             |
| `keepSubscribed`         | Re-runs a subscription stream after every reconnect until the consumer interrupts it.                               |

### `rpc-toolkit/rpc/cloudflare/hibernating-rpc`

Long-form guide: [src/rpc/cloudflare/hibernating-rpc/README.md](src/rpc/cloudflare/hibernating-rpc/README.md).

| Export                        | What it does                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `makeHibernatingWebSocketRpc` | Builds `accept`, `message`, and `close` callbacks that serve an `RpcGroup` over hibernatable Durable Object sockets. |
| `StreamCheckpoint`            | Inside a streaming handler, gives `get`, `put`, and `clear` for a small cursor that survives hibernation.            |
| `fromDurableObjectState`      | Builds the `state` and `upgrade` ports from a raw workerd `DurableObjectState` when Alchemy is not in use.           |

### `rpc-toolkit/rpc/cloudflare/alchemy/rpc-worker`

| Export      | What it does                                                                                |
| ----------- | ------------------------------------------------------------------------------------------- |
| `RpcWorker` | Re-export of Alchemy's `Cloudflare.RpcWorker` for Effect RPC over a Worker service binding. |

### `rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker`

| Export             | What it does                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `DurableRpcWorker` | Declares an Alchemy Worker plus a single Durable Object that serves an `RpcGroup` over hibernating WebSockets behind one URL. |

## Usage

### Declare who may call an RPC

The contract declares a `Role` Cannotation and attaches it to a group and to one endpoint. The server layer verifies headers and provides `CurrentUser`; the client layer adds the headers. Lifted from `src/rpc/cannotation/cannotation.test.ts`.

```ts
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { Headers } from 'effect/unstable/http';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Cannotation } from 'rpc-toolkit/rpc/cannotation';

class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly role: string }
>()('app/CurrentUser') {}

class Forbidden extends Schema.Error<Forbidden>('app/Forbidden')({
  _tag: Schema.tag('Forbidden'),
  reason: Schema.String,
}) {}

type Role = 'admin' | 'user';
const Role = Cannotation.make<Role>()('app/Role', {
  provides: CurrentUser,
  error: Forbidden,
  client: true,
});

const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String });
const Ban = Rpc.make('Ban', { success: Schema.String }).pipe(
  Role.with('admin'),
);
const Users = Role.with('user')(RpcGroup.make(WhoAmI, Ban));

// server
const RoleLive = Role.layer(({ value, headers }) =>
  Effect.gen(function* () {
    const role = headers['x-role'] ?? 'user';
    if (Option.isSome(value) && value.value === 'admin' && role !== 'admin') {
      return yield* new Forbidden({ reason: 'admin only' });
    }
    return { id: headers['x-user'] ?? 'anon', role };
  }),
);

// client
const RoleClient = Role.clientLayer(({ request, next }) =>
  next({
    ...request,
    headers: Headers.fromInput({ 'x-user': 'u1', 'x-role': 'user' }),
  }),
);
```

- `Role.get(Users.requests.get('Ban'))` is `admin`; `WhoAmI` inherits `user`. Nearest Wins, no merging.
- `layer` receives the resolved value and the native middleware options; what it returns is provided as `CurrentUser` to handlers.
- A Cannotation that `requires` a service must be attached before the one that `provides` it. The later attachment wraps the earlier one.
- `client: true` makes the client layer mandatory when building an `RpcClient`.

### Serve a stream that survives hibernation

The server rechecks authorization on every call, charges admission only on fresh calls, and checkpoints the stream cursor. `DurableRpcWorker` deploys it as one Worker plus one Durable Object. Trimmed from [docs/websocket-example.md](docs/websocket-example.md).

```ts
// server.ts
import { Effect, Layer, Option, Schema, Stream } from 'effect';
import { StreamCheckpoint } from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
import { InvocationKind } from 'rpc-toolkit/rpc/invocation';
import { Access, Counter } from './contract.js';

export const makeHandlers = (auth: {
  authorize: (token?: string) => Effect.Effect<void, Forbidden>;
  checkRateLimit: (token?: string) => Effect.Effect<void, Forbidden>;
}) =>
  Layer.merge(
    Access.layer(({ headers }) =>
      Effect.gen(function* () {
        yield* auth.authorize(headers.authorization);
        if ((yield* InvocationKind) === 'fresh') {
          yield* auth.checkRateLimit(headers.authorization);
        }
      }),
    ),
    Counter.toLayer({
      watch: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const checkpoint = yield* StreamCheckpoint(Schema.Number);
            let cursor = Option.getOrElse(
              yield* checkpoint.get().pipe(Effect.orDie),
              () => 0,
            );
            return Stream.repeatEffect(
              Effect.gen(function* () {
                yield* Effect.sleep('1 second');
                yield* checkpoint.put(++cursor).pipe(Effect.orDie);
                return cursor;
              }),
            );
          }),
        ),
    }),
  );

// counter-worker.ts
export default class CounterWorker extends DurableRpcWorker<CounterWorker>()(
  'CounterWorker',
  { main: import.meta.filename, schema: Counter },
  Effect.sync(() => makeHandlers(authorization)),
) {}
```

- On wake, every persisted streaming request is replayed through server middleware with `InvocationKind` set to `replay`. Authorization must check current permission each time; Connection Identity alone is not current authorization.
- Replay reuses the original request headers. It does not fetch fresh client credentials.
- Streaming handlers are re-run, not resumed. Read the checkpoint first and keep the pre-stream section idempotent.
- Attachments hold about 2 KB per socket, shared by the connection value and every in-flight stream. Store cursors, not payloads.
- Continuous revocation during an uninterrupted stream stays application policy; the toolkit only rechecks at fresh calls and replays.

### Keep a browser subscription alive across reconnects

`layerWebSocketProtocol` wires the transport; `keepSubscribed` restarts the stream whenever a new connection is established. Trimmed from [docs/websocket-example.md](docs/websocket-example.md).

```ts
import { Effect, Layer, Stream } from 'effect';
import { Headers } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import {
  keepSubscribed,
  layerWebSocketProtocol,
} from 'rpc-toolkit/rpc/websocket-client';
import { Access, Counter } from './contract.js';

export const watchCounter = (
  url: string,
  getToken: () => string,
  onValue: (value: number) => void,
) =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(Counter);
    yield* keepSubscribed(() => client.watch()).pipe(
      Stream.runForEach((value) => Effect.sync(() => onValue(value))),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(
        layerWebSocketProtocol({
          url,
          serialization: RpcSerialization.layerJson,
        }),
        Access.clientLayer(({ request, next }) =>
          next({
            ...request,
            headers: Headers.fromInput({ authorization: getToken() }),
          }),
        ),
      ),
    ),
    Effect.scoped,
  );
```

- A subscription restarted after reconnect is a Fresh Call: client middleware runs again, so `getToken` is called again, and the server charges admission again.
- Hibernation Replay happens on the existing connection and is invisible to the client; only a dropped socket triggers `keepSubscribed`.
- Errors propagate. Interrupting the consumer stops the restart loop for good.
- Use `Layer.provideMerge` when your own code also needs `RpcConnection`; plain `Layer.provide` hides it.
