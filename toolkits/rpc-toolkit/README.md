# @kestack/rpc-toolkit

Effect RPC and HttpApi with Middleware both sides agree on, three Transports with a fixed protocol, and Cloudflare deploy declarations

## Big picture

Effect RPC and Effect HttpApi give you middleware, but every app re-invents the same layer on top: a declaration on an endpoint that says how it may be called, a server half that checks it, a client half that rewrites the outgoing request. rpc-toolkit ships that once as Middleware (`middleware` from the `rpc` door and from the `http-api` door). The declaration lives in shared contract code; the two halves stay on their own side of the wire. Who may call what is auth-toolkit's Guard, built on this Middleware; use [`@kestack/auth-toolkit`](../auth-toolkit/README.md) for sign-in and authorization.

The other thing every app re-invents is how a client reaches its server. Effect RPC gets three Transports, each its own door and each a client and server pair with the protocol fixed so the two always agree: `rpc/http` (POST, NDJSON, batched, on anything that speaks `Request` and `Response`), `rpc/websocket` (a Cloudflare Durable Object that hibernates without breaking streams, and a client that restarts subscriptions after a reconnect) and `rpc/in-process` (the handlers in the same process, no wire). Client code is `RpcClient.make(group)` on every Transport, so moving between them changes one layer.

The `alchemy` door deploys the websocket server as one Worker plus one Durable Object. The websocket server can keep its Stream Store on the Durable Object's own SQLite through [`@kestack/std-toolkit`](../std-toolkit/README.md), for sockets whose open streams outgrow the attachment. The `rpc` and `http-api` doors never import Alchemy, and Cloudflare only as types.

Vocabulary is in [CONTEXT.md](CONTEXT.md) and the decisions behind the shape are in [docs/adr/](docs/adr/) and the repo's [ADR 0005](../../docs/adr/0005-three-toolkits-three-doors.md). A full contract, server, worker and browser example is in [docs/websocket-example.md](docs/websocket-example.md). Long-form guides to the websocket Transport are its module READMEs: [server](src/rpc/websocket/server/README.md) and [client](src/rpc/websocket/client/README.md).

## Install

```sh
pnpm add @kestack/rpc-toolkit @kestack/std-toolkit effect
```

- `effect` (peer, required): every door builds on `effect/rpc` or `effect/http-api`.
- `alchemy` and `@alchemy.run/cloudflare` (peers, optional): needed only by the `alchemy` door, which wraps Alchemy's Cloudflare resources.
- `@kestack/std-toolkit` (peer, required): `sqliteStreamStore` keeps stream state in a StdTable on the Durable Object's SQLite.

## Exports

Each door exports plain names, so an app imports only what it uses and two doors' names meet only where the app renames one (`import { client as httpClient } from '@kestack/rpc-toolkit/rpc/http'`). Why one door per Transport is [ADR 0005](docs/adr/0005-one-door-per-transport-named-exports.md).

### `@kestack/rpc-toolkit/rpc`

| Export       | What it does                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware` | Declares a Middleware for `Rpc` and `RpcGroup` targets; the result carries `with`, `get`, `layer`, `client`, `middleware` and `value`. |
| `onExit`     | Runs an observer with the Exit of each call sent from within an effect, before the caller sees it, over every Transport.               |

### `@kestack/rpc-toolkit/rpc/http`

| Export   | What it does                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `client` | Layer that provides an `RpcClient.Protocol` over HTTP POST and NDJSON with `fetch`, optionally with `credentials` and extra headers.         |
| `server` | Turns a group and its handlers into a `(request: Request) => Promise<Response>` that answers the http client, building handlers per request. |

### `@kestack/rpc-toolkit/rpc/websocket`

| Export                   | What it does                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`                 | Layer that provides an `RpcClient.Protocol` over a WebSocket speaking JSON, plus the `RpcConnection` that tracks it; a `url` given as an Effect is run before every connect. |
| `connection`             | The `RpcConnection` service: the connection's status, `keepSubscribed`, and the hooks the transport drives.                                                                  |
| `status`                 | Stream of `connecting`, `connected` or `reconnecting`, deduplicated and primed with the current value.                                                                       |
| `keepSubscribed`         | Re-runs a subscription stream after every reconnect until the consumer interrupts it.                                                                                        |
| `server`                 | Serves a group over a Durable Object's hibernatable WebSockets, returning its `accept`, `message` and `close` callbacks.                                                     |
| `checkpoint`             | Inside a streaming handler, gives `get`, `put` and `clear` for a small cursor that survives hibernation; on other Transports it remembers nothing.                           |
| `attachmentStreamStore`  | The default Stream Store: each socket's record and open streams live in its attachment (about 2 KB per socket).                                                              |
| `sqliteStreamStore`      | A Stream Store on a Durable Object's SQLite: the attachment keeps only the client id, records and streams are rows it creates itself.                                        |
| `RESUME_LOST`            | Close code (4000) the server sends a live socket whose record is missing, so the client reconnects and resubscribes.                                                         |
| `fromDurableObjectState` | Builds the server's `state` and `upgrade` from a raw workerd `DurableObjectState` when Alchemy is not in use.                                                                |
| `InvocationKind`         | Context reference the server sets to `fresh` or `replay`; middleware reads it to skip admission on Hibernation Replay.                                                       |

### `@kestack/rpc-toolkit/rpc/in-process`

| Export   | What it does                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `client` | Layer that provides an `RpcClient.Protocol` answered by a group's handlers in the same process, with no transport and no serialization. |

### `@kestack/rpc-toolkit/http-api`

| Export       | What it does                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware` | Same shape as the `rpc` door's `middleware` over `HttpApiEndpoint` and `HttpApiGroup`, plus a `security` option that feeds OpenAPI and hands the credential to the server half. |

### `@kestack/rpc-toolkit/alchemy`

| Export             | What it does                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RpcWorker`        | Alchemy's `Cloudflare.RpcWorker`, for Effect RPC over a Worker service binding.                                                                                         |
| `DurableRpcWorker` | Declares an Alchemy Worker plus a single Durable Object that serves a group with the websocket `server` behind one URL, optionally with its own `streams` Stream Store. |

## Usage

### Limit how often an endpoint may be called

The contract declares a `RateLimit` Middleware with a value: the group allows 100 calls, `Search` only 2. The server half counts Fresh Calls per endpoint and fails past the nearest limit. The `rpc/in-process` client serves it in the same process. Lifted from `src/integration-tests/rate-limit.test.ts`.

```ts
import { Effect, Layer, Option, Schema } from 'effect';
import { Rpc as EffectRpc, RpcClient, RpcGroup } from 'effect/rpc';
import { middleware } from '@kestack/rpc-toolkit/rpc';
import { client as inProcessClient } from '@kestack/rpc-toolkit/rpc/in-process';
import { InvocationKind } from '@kestack/rpc-toolkit/rpc/websocket';

// contract.ts: imported by client and server
class TooManyCalls extends Schema.Error<TooManyCalls>('app/TooManyCalls')({
  _tag: Schema.tag('TooManyCalls'),
}) {}
const RateLimit = middleware<number>()('app/RateLimit', {
  error: TooManyCalls,
});
const Search = EffectRpc.make('Search', { success: Schema.String }).pipe(
  RateLimit.with(2),
);
const List = EffectRpc.make('List', { success: Schema.String });
const Api = RateLimit.with(100)(RpcGroup.make(Search, List));

// server.ts
const RateLimitLive = RateLimit.layer(
  Effect.sync(() => {
    const calls = new Map<string, number>();
    return ({ rpc, value }) =>
      Effect.gen(function* () {
        if ((yield* InvocationKind) === 'replay') return;
        const count = (calls.get(rpc._tag) ?? 0) + 1;
        calls.set(rpc._tag, count);
        if (count > Option.getOrElse(value, () => Infinity)) {
          return yield* new TooManyCalls();
        }
      });
  }),
);

const Handlers = Api.toLayer({
  Search: () => Effect.succeed('found'),
  List: () => Effect.succeed('listed'),
});

// a client of the same process
const program = Effect.gen(function* () {
  const api = yield* RpcClient.make(Api);
  return yield* api.Search();
}).pipe(
  Effect.scoped,
  Effect.provide(inProcessClient(Api, Layer.merge(Handlers, RateLimitLive))),
);
```

- `middleware<V>()` is curried so the value type is given while the rest (`provides`, `requires`, `error`, `client`) is inferred.
- Nearest Wins: `RateLimit.get(Api.requests.get('Search'))` is `2`, `List` inherits `100`; values are never merged.
- `layer` receives the resolved value and the native middleware options; what it returns is provided as `provides` to handlers. A Middleware that `requires` a service must be attached before the one that `provides` it.
- `client: true` in the options makes the client half (`RateLimit.client(...)`) mandatory when building an `RpcClient`.
- A call restored by Hibernation Replay has `InvocationKind` `replay` and is not counted again.

### Serve an Api over HTTP and call it

The `rpc/http` door's `server` answers one `Request` with a `Response`, so it runs on a Worker, Bun, Node or a test. Its `client` calls it. Lifted from `src/rpc/http/http.test.ts`.

```ts
import { Context, Effect, Layer, Stream } from 'effect';
import { RpcClient } from 'effect/rpc';
import {
  client as httpClient,
  server as httpServer,
} from '@kestack/rpc-toolkit/rpc/http';

class Greeting extends Context.Service<Greeting, string>()('app/Greeting') {}

// server: (request: Request) => Promise<Response>
export const answer = httpServer(Api, Handlers, {
  services: (request) =>
    Layer.succeed(Greeting, request.headers.get('x-greeting')!),
});

// client
const program = Effect.gen(function* () {
  const api = yield* RpcClient.make(Api);
  const hello = yield* api.Hello({ name: 'Ada' });
  const counted = yield* Stream.runCollect(api.Count({ to: 3 }));
  return { hello, counted };
}).pipe(
  Effect.scoped,
  Effect.provide(
    httpClient(Api, {
      url: 'https://api.example.com/rpc',
      credentials: 'omit',
      headers: { 'x-greeting': 'Hi' },
    }),
  ),
);
```

- Only a POST is answered; anything else is a 405 with `Allow: POST`.
- `handlers` and `services(request)` are built fresh for each request and live as long as its response, which a streamed body outlives.
- `wrap: (app) => app` wraps how every request is answered, such as setting a header on every response; rpc-toolkit itself knows nothing of sign-in.
- The client gives the `RpcClient.Protocol` only; `RpcClient.make(group)` on top is the same on every Transport.

### Keep a stream alive across hibernation and reconnects

The server checkpoints its cursor so a replay after waking continues where it was; the client restarts the subscription after a dropped socket. `DurableRpcWorker` deploys the server as one Worker plus one Durable Object. Trimmed from [docs/websocket-example.md](docs/websocket-example.md).

```ts
// counter-worker.ts
import { Effect, Option, Schema, Stream } from 'effect';
import { DurableRpcWorker } from '@kestack/rpc-toolkit/alchemy';
import {
  checkpoint,
  client as websocketClient,
  keepSubscribed,
} from '@kestack/rpc-toolkit/rpc/websocket';

const Handlers = Counter.toLayer({
  watch: () =>
    Stream.unwrap(
      Effect.gen(function* () {
        const progress = yield* checkpoint(Schema.Number);
        let cursor = Option.getOrElse(
          yield* progress.get().pipe(Effect.orDie),
          () => 0,
        );
        return Stream.repeatEffect(
          Effect.gen(function* () {
            yield* Effect.sleep('1 second');
            yield* progress.put(++cursor).pipe(Effect.orDie);
            return cursor;
          }),
        );
      }),
    ),
});

export default class CounterWorker extends DurableRpcWorker<CounterWorker>()(
  'CounterWorker',
  { main: import.meta.filename, schema: Counter },
  Effect.succeed(Handlers),
) {}

// client.ts
const watch = Effect.gen(function* () {
  const client = yield* RpcClient.make(Counter);
  yield* keepSubscribed(() => client.watch()).pipe(
    Stream.runForEach((value) => Effect.sync(() => render(value))),
  );
}).pipe(
  Effect.provide(websocketClient(Counter, { url: workerUrl })),
  Effect.scoped,
);
```

- Streaming handlers are re-run on wake, not resumed. Read the checkpoint first and keep the pre-stream section idempotent.
- By default attachments hold about 2 KB per socket, shared by the connection value and every in-flight stream. Store cursors, not payloads, or pass `streams: (state) => sqliteStreamStore({ storage: state.raw.storage })` to keep them in the Durable Object's SQLite.
- Hibernation Replay happens on the existing connection and is invisible to the client; only a dropped socket triggers `keepSubscribed`, which is a Fresh Call and runs client middleware again.
- Use `Layer.provideMerge` when your own code also needs the websocket `connection`; plain `Layer.provide` hides it.
