# hibernating-rpc

```ts
import { makeHibernatingWebSocketRpc } from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
```

An Effect `RpcServer` that runs over **hibernatable** Durable Object WebSockets, so your
streams survive the Durable Object being evicted from memory.

The browser half of this lives in
[`websocket-client`](../../websocket-client/README.md) — it re-subscribes your
streams when the socket reconnects.

---

## The problem

A Durable Object holding a WebSocket the normal way is **pinned in memory**:

```ts
ws.accept(); // I own this socket, so I can never be evicted
```

You are billed for wall-clock duration for as long as any tab is open. One idle user
overnight bills you for the whole night.

Cloudflare's fix is hibernation — hand the socket to the runtime instead:

```ts
state.acceptWebSocket(ws); // runtime owns it, evict me freely
```

Now Cloudflare destroys your object while idle — every closure, every `Map`, every running
fiber — while **keeping the TCP connection alive at the edge**. You stop being billed. The
client notices nothing.

And that last part is the catch. In the non-hibernating world, a dying object closed its
sockets, the client reconnected, and your streams were quietly repaired by that reconnect.
**Hibernation removes the disconnect, so it removes the recovery.** A client subscribed to a
stream sits on a healthy-looking socket behind a fiber that no longer exists, forever.

This package gives that recovery back, on the server, invisibly.

---

## The mental model

Your object keeps dying and waking up. On wake it has an open socket and knows nothing.
Two sticky notes survive on each socket:

|                      | question it answers | written by                       | changes?   |
| -------------------- | ------------------- | -------------------------------- | ---------- |
| **connection**       | _who is this?_      | the package, once, at connect    | no         |
| **StreamCheckpoint** | _where was I?_      | your stream handler, as it works | constantly |

That's the whole package. Everything else — eviction, replay, ping/pong, rebuilding the
socket map — is internal and never surfaces.

**Three rules:**

1. A streaming handler is **re-run from the top** every time the object wakes. It is not
   resumed. Read the checkpoint first and continue from it.
2. Sticky notes are **tiny** — Cloudflare gives ~2 KB per socket, shared by the connection
   value _and_ every in-flight stream on that socket. Store a cursor, never a payload.
3. `StreamCheckpoint` exists **only inside streaming RPC handlers**. Anywhere else it dies.

---

## Install

See the [package README](../../../../README.md#install) for peer-dependency rules.

Alchemy is **not** a dependency. The package talks to two structural ports — `state`
(`getWebSockets` + `setWebSocketAutoResponse`) and `upgrade` — which `alchemy/Cloudflare`
satisfies as-is; `fromDurableObjectState` builds them from a raw workerd
`DurableObjectState` for everyone else.

---

## Quick start

Your RPC contract does not change. Nothing about it is Cloudflare-specific:

```ts
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import * as Schema from 'effect/Schema';

export class CounterUpdate extends Schema.Class<CounterUpdate>('CounterUpdate')(
  {
    count: Schema.Number,
  },
) {}

export class CounterRpcs extends RpcGroup.make(
  Rpc.make('increment'),
  Rpc.make('watch', { success: CounterUpdate, stream: true }),
) {}
```

Wire the Durable Object:

```ts
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { makeHibernatingWebSocketRpc } from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';

const CounterObject = Cloudflare.DurableObject(
  'CounterObject',
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      const rpc = yield* makeHibernatingWebSocketRpc({
        state,
        upgrade: Cloudflare.upgrade,
        group: CounterRpcs,
        layer: makeCounterHandlers(),
      });

      return {
        fetch: rpc.accept,
        webSocketMessage: rpc.message,
        webSocketClose: rpc.close,
      };
    }).pipe(Effect.provide(RpcSerialization.layerJson));
  }),
);
```

Note the shape: you return **three** entry points, not one `fetch`. You no longer own a
connection for its lifetime — you own callbacks that get handed sockets you don't remember.

---

## `StreamCheckpoint` — "where was I?"

### Before and after

A stream that keeps its position in a closure works fine in dev and rewinds in production
the first time the object is evicted:

```ts
// ❌ broken under hibernation
watch: () =>
  Stream.unwrap(
    Effect.gen(function* () {
      let cursor = 0; // gone the moment the object is evicted
      return changes.pipe(Stream.mapEffect(() => readSince(cursor)));
    }),
  ),
```

The fix is a read-resume-write sandwich around code that otherwise doesn't change:

```ts
// ✅ survives hibernation
import { StreamCheckpoint } from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';

const Cursor = Schema.Struct({ cursor: Schema.Number });

watch: () =>
  Stream.unwrap(
    Effect.gen(function* () {
      const checkpoint = yield* StreamCheckpoint(Cursor);

      // 1. have I been here before?
      const saved = yield* checkpoint.get().pipe(Effect.orDie);
      let cursor = Option.match(saved, {
        onNone: () => 0,
        onSome: ({ cursor }) => cursor,
      });

      return changes.pipe(
        Stream.mapEffect(() =>
          readSince(cursor).pipe(
            Effect.tap((batch) => {
              // 2. note where I am, every time I advance
              cursor = batch.at(-1)?.id ?? cursor;
              return checkpoint.put({ cursor }).pipe(Effect.orDie);
            }),
          ),
        ),
      );
    }),
  ),
```

### Honouring a client-supplied starting point

The saved checkpoint wins over what the client asked for — otherwise every wake replays
from the client's original request:

```ts
subscribe: ({ since }) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const checkpoint = yield* StreamCheckpoint(Cursor);
      const saved = yield* checkpoint.get().pipe(Effect.orDie);
      const cursor = Option.match(saved, {
        onNone: () => since, // first subscribe — trust the client
        onSome: ({ cursor }) => cursor, // resumed — trust ourselves
      });
      // ...
    }),
  ),
```

### Opaque checkpoint data

Pass `Schema.Unknown` when structured-cloneable values should round-trip as-is:

```ts
Effect.gen(function* () {
  const checkpoint = yield* StreamCheckpoint(Schema.Unknown);
  yield* checkpoint.put({ page: 3 });
  const saved = yield* checkpoint.get(); // Option<unknown>
});
```

Prefer a specific schema when the value's shape may change between deploys — see _Limitations_.

### Explicitly finishing

Completed streams are cleaned up automatically when the handler exits. Call `clear` only
when the stream stays open but has nothing more to resume from:

```ts
Effect.gen(function* () {
  const checkpoint = yield* StreamCheckpoint(Cursor);
  yield* checkpoint.clear;
});
```

---

## The connection slot — "who is this?"

Everything about _what a connection is_ belongs to you. The package only stores the value
and hands it back after every wake.

```ts
// app/connection.ts
import * as Context from 'effect/Context';
import * as Schema from 'effect/Schema';

export const IdentitySchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('anon') }),
  Schema.Struct({
    kind: Schema.Literal('user'),
    userId: Schema.String,
    email: Schema.String,
  }),
]);

export const Identity = Context.Reference<typeof IdentitySchema.Type>(
  'my-app/Identity',
  { defaultValue: () => ({ kind: 'anon' }) },
);
```

### Resolving it from the upgrade request

`initial` runs **once**, before the WebSocket upgrade:

```ts
Effect.gen(function* () {
  const auth = yield* AuthService;

  const rpc = yield* makeHibernatingWebSocketRpc({
    state,
    group: ChatRpcs,
    layer: handlers,
    connection: {
      tag: Identity,
      schema: IdentitySchema,
      initial: (request) =>
        auth.verify(request.headers.cookie).pipe(
          Effect.map((session) => ({
            kind: 'user' as const,
            userId: session.user.id,
            email: session.user.email,
          })),
          Effect.orElseSucceed(() => ({ kind: 'anon' as const })),
        ),
    },
  });
});
```

### Reading it in any handler

Streaming or not — it's a plain value from your own tag:

```ts
sendMessage: (payload) =>
  Effect.gen(function* () {
    const who = yield* Identity;
    if (who.kind === 'anon') return yield* Effect.fail(new NotLoggedIn());
    return yield* send({ ...payload, userId: who.userId });
  }),
```

### Rejecting the connection outright

`initial` runs before the upgrade, so failing it returns a real HTTP response instead of a
101 — better than a bare WebSocket close code the client can't interpret:

```ts
initial: (request) =>
  auth.verify(request.headers.cookie).pipe(
    Effect.map((session) => ({ kind: 'user' as const, userId: session.user.id })),
    Effect.orElseFail(() =>
      HttpServerResponse.text('Unauthorized', { status: 401 }),
    ),
  ),
```

### Without a schema

Plain structured-cloneable data needs no schema:

```ts
connection: {
  tag: Tenant,
  initial: (request) =>
    Effect.succeed({ tenantId: request.headers['x-tenant-id'] ?? 'public' }),
},
```

### Omitting it entirely

Connections that carry no state just leave `connection` out:

```ts
Effect.gen(function* () {
  const rpc = yield* makeHibernatingWebSocketRpc({ state, group, layer });
});
```

If no value was stored — never set, or it failed to decode after a shape change — the
package **does not provide the tag at all**, so your `Context.Reference`'s own
`defaultValue` applies. That's why the tag carries the fallback and the API has no
`default` option.

---

## What happens behind the scenes

| moment                       | what the package does                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`                     | runs `initial`, then `Cloudflare.upgrade()` (which calls `state.acceptWebSocket`), assigns a client id, writes the attachment                         |
| every boot                   | `state.getWebSockets()` and rebuilds its socket map from attachments — identical code on a cold start and after a wake, and it can't tell which it is |
| a stream request arrives     | persists the request message in the attachment and provides `StreamCheckpoint` scoped to it                                                           |
| a non-stream request arrives | nothing persisted — it completes within one wake                                                                                                      |
| wake-up                      | replays every persisted request before processing the message that woke it                                                                            |
| stream completes             | drops the persisted request; nothing left to replay                                                                                                   |
| idle                         | ping/pong is registered as a Cloudflare **auto-response**, answered at the edge without waking the object                                             |

---

## Limitations

**~2 KB of state per socket, total.** Cloudflare caps `serializeAttachment`. That budget is
shared by the connection value and the persisted request + checkpoint of _every_ in-flight
stream on the socket. Exceeding it fails at write time — mid-stream, not at deploy time.
Store cursors, not data. Verify the current cap in Cloudflare's docs.

**Streaming handlers must be replay-safe.** They are re-run, not resumed. A handler with
side effects at the top (writing a row, sending an email, incrementing something) will
repeat them on every wake. Keep the pre-stream section idempotent.

**Connection state is write-once.** There is no way to revalidate mid-connection. If a user
logs out through an HTTP API, this socket will keep asserting the identity it was given at
connect until the client reconnects. If that matters, the object must be told out-of-band
(a control RPC, or your auth service poking the DO).

**Attachments outlive deploys.** A socket hibernating right now carries a value written by
your _previous_ build. Change the shape and it wakes up mismatched. A `schema` turns that
into a clean decode miss that falls back to the tag's default; without one you get whatever
the old build wrote. Version deliberately, or expect one degraded generation of sockets
after a shape change.

**No RPC-level acknowledgement.** The protocol reports `supportsAck: false`, so there is no
backpressure — a fast producer can outrun a slow client.

**In-flight non-streaming requests are not persisted.** They're assumed to complete within a
single wake. If the object dies mid-request the client's promise never settles.

**`webSocketError` is not handled.** Only `fetch`, `webSocketMessage`, and `webSocketClose`
are wired.

**`close` does not wait for wake-up replay.** A disconnect arriving while persisted streams
are being restored can race the replay.

**Beta surface.** Built on `effect/unstable/rpc`. The peer range will need bumping as the
beta moves.

**Raw-workerd path is untested.** `fromDurableObjectState` is typechecked but the app here
runs the alchemy path, so that adapter has no coverage yet.

---

## API

```ts
makeHibernatingWebSocketRpc<Rpcs, E, R, A>(options: {
  state: HibernationState<R>
  upgrade: Upgrade<R>
  group: RpcGroup.RpcGroup<Rpcs>
  layer: Layer.Layer<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>, E, never>
  connection?: {
    tag: Context.Reference<A>
    initial: (request: HttpServerRequest) => Effect<A, HttpServerResponse>
    schema?: Schema.Codec<A, unknown>
  }
}): Effect<{
  accept: Effect<HttpServerResponse>
  message: (socket: HibernatingSocket, data: string | ArrayBuffer) => Effect<void>
  close: (socket: HibernatingSocket, code: number, reason: string) => Effect<void>
}>

StreamCheckpoint<S extends Schema.Top>(schema: S): Effect<{
  get: () => Effect<Option<S['Type']>, SchemaError, S['DecodingServices']>
  put: (value: S['Type']) => Effect<void, SchemaError, S['EncodingServices']>
  clear: Effect<void>
}>
```
