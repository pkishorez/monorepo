# Rpc.websocket client

```ts
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

Rpc.websocket.client; // the Transport's client half
Rpc.websocket.connection; // the RpcConnection service
Rpc.websocket.status; // connecting, connected or reconnecting
Rpc.websocket.keepSubscribed; // re-run a subscription after every reconnect
```

The browser half of the websocket Transport. Two jobs:

1. **Wire the Transport** — an `RpcClient` protocol over a WebSocket speaking JSON (as
   the server does), with the `ws://` URL derived from `location` and reconnection
   turned on.
2. **Track the connection** — expose whether you are connected, and re-run your
   subscriptions after every reconnect.

Job 2 is what pairs with [`Rpc.websocket.server`](../server/README.md). The server
keeps stream state alive across hibernation; this keeps the client re-attached to it.

---

## The problem

`RpcClient.layerProtocolSocket({ retryTransientErrors: true })` reconnects a dropped
socket for you. It does **not** restart what was running on it.

A request in flight fails and you retry it — fine. But a _stream_ subscription is not a
request you can retry; it is a long-lived attachment. When the socket dies, the server
stops pushing and the client stream just sits there. The transport is healthy again, and
your UI has silently stopped updating. Nothing errors. Nothing logs.

`keepSubscribed` closes that gap: it tears down and re-runs your subscription every time
a new connection is established.

---

## Quick start

```ts
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { RpcClient } from 'effect/rpc';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

const protocol = Rpc.websocket.client(ChatRpcs, { url: '/rpc/chat' });

export const runtime = ManagedRuntime.make(
  Layer.effect(ChatApi, RpcClient.make(ChatRpcs)).pipe(
    Layer.provideMerge(protocol),
  ),
);
```

Then, anywhere in that runtime:

```ts
yield *
  Stream.runForEach(
    Rpc.websocket.keepSubscribed(() => api.subscribeMessages({ '>': cursor })),
    applyBatch,
  );
```

### `Layer.provideMerge`, not `Layer.provide`

`Rpc.websocket.client` outputs three services: `RpcClient.Protocol`,
`RpcConnection`, and `RpcClient.ConnectionHooks`. Plain `Layer.provide` would satisfy the
client and then **hide** `RpcConnection` from your own code, so `keepSubscribed` would
not typecheck. Use `provideMerge`.

---

## The URL

One field, relative or absolute:

| You pass                   | With `location`           | You get                      |
| -------------------------- | ------------------------- | ---------------------------- |
| `'/rpc/chat'`              | `https://example.com/app` | `wss://example.com/rpc/chat` |
| `'/rpc'`                   | `http://localhost:5173/`  | `ws://localhost:5173/rpc`    |
| `'wss://other.test/rpc'`   | anything                  | `wss://other.test/rpc`       |
| `'https://other.test/rpc'` | anything                  | `wss://other.test/rpc`       |

The query is kept (handy for connection tokens) and the hash dropped. Resolution happens **lazily at layer build time**, so a
module-level `ManagedRuntime` is safe to construct during SSR — nothing touches
`location` until the runtime is first used in a browser.

A relative URL with no `globalThis.location` (SSR, a Worker) throws a descriptive error
rather than producing a broken URL. Pass an absolute URL there.

### A URL that changes between connects

Pass an Effect instead of a string and it runs again before every connect,
so a reconnect carries what changed since, such as a fresh token (a browser
cannot set headers on a WebSocket):

```ts
Rpc.websocket.client(ChatRpcs, {
  url: Effect.map(currentToken, (token) => `/rpc/chat?access_token=${token}`),
});
```

---

## Connection status

```ts
type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';
```

- `connecting` — never reached the server yet.
- `connected` — live.
- `reconnecting` — was connected at least once, currently is not.

There is **no terminal state**. `RpcClient.ConnectionHooks` only reports connect and
disconnect; it has no "gave up" signal, so neither does this.

```ts
yield *
  Stream.runForEach(Rpc.websocket.status, (status) =>
    Effect.sync(() => setStatus(status)),
  );
```

The stream is deduplicated (`Stream.changes`) and emits the current value immediately on
subscribe, so there is nothing to prime.

---

## `keepSubscribed`: free function or service method?

Both exist and behave identically. They differ only in where the `RpcConnection`
requirement lands.

**Free function** — leaves `RpcConnection` in the stream's `R`. Use it when the stream is
consumed inside the runtime that provides it:

```ts
yield *
  Stream.runForEach(
    Rpc.websocket.keepSubscribed(() => api.streamHello()),
    handle,
  );
```

**Service method** — returns `Stream<A, E, R>` with no `RpcConnection` in `R` at all. Use
it when the stream **escapes** the runtime, which is otherwise the one case where you end
up re-providing the service by hand:

```ts
const connection = yield * Rpc.websocket.connection;
return connection
  .keepSubscribed(() => api.subscribeMessages({ '>': cursor }))
  .pipe(Stream.orDie); // hands a fully-provided stream to the caller
```

### Semantics

- Restarts **once** per reconnect, not once per hook fire — an internal generation
  counter distinguishes a genuine new connection from a repeat signal.
- A subscription that **completes on its own** is done. It is not resumed on the next
  reconnect.
- Errors **propagate**. `keepSubscribed` does not swallow a failing subscription.
- Interrupting the consumer stops it for good — no restart after cancellation.
- Separate invocations are independent; each tracks its own subscription.

---

## API

```ts
Rpc.websocket.client(group, options: {
  url: string                    // relative or absolute
  retryTransientErrors?: boolean // default true
}): Layer.Layer<RpcClient.Protocol | RpcConnection | RpcClient.ConnectionHooks>

Rpc.websocket.connection         // the RpcConnection service:
                                 //   connectionStatus, keepSubscribed, hooks

Rpc.websocket.status: Stream<ConnectionStatus, never, RpcConnection>
Rpc.websocket.keepSubscribed: <A, E, R>(
  subscribe: () => Stream<A, E, R>,
) => Stream<A, E, R | RpcConnection>

type Rpc.ConnectionStatus
```

The connection layer and its constructor are deliberately **not** exported —
`Rpc.websocket.client` is the only supported way to get an `RpcConnection`, so there is
no way to end up with a tracker the transport is not driving. The serialization is not an
option either: the client and server both speak JSON, so they always agree.

---

## Limitations

**Not Cloudflare-specific.** Nothing here knows about Durable Objects; it works against
any Effect RPC server over a socket. It ships in this package because it is the client
you want when the server is `Rpc.websocket.server`.

**Browser-oriented.** `Rpc.websocket.client` uses the global `WebSocket` constructor and
resolves relative URLs against `location`. Elsewhere, pass an absolute URL.

**Each app still declares its own tagged client service.** The `Context.Service` wrapper
around `RpcClient.make(Group)` is a few lines of boilerplate per app. Absorbing it would
mean threading `RpcGroup` generics through a factory, which was judged not worth it.
