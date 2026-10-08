# Rpc.websocket server

```ts
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

Rpc.websocket.server; // serve an Api over hibernatable sockets
Rpc.websocket.checkpoint; // "where was I?" inside a streaming handler
Rpc.websocket.InvocationKind; // fresh or replay
Rpc.websocket.fromDurableObjectState; // the ports, without alchemy
Rpc.websocket.streams.attachment; // default home for stream state
Rpc.websocket.streams.sqlite; // stream state in the Durable Object's SQLite
Rpc.websocket.RESUME_LOST; // close code 4000: "resubscribe, nothing was kept"
```

An Effect `RpcServer` that runs over **hibernatable** Durable Object WebSockets, so your
streams survive the Durable Object being evicted from memory.

The browser half of this lives in
[`Rpc.websocket.client`](../client/README.md) — it re-subscribes your
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
Two kinds of sticky notes can survive on each socket:

|                | question it answers | written by                       | changes?   |
| -------------- | ------------------- | -------------------------------- | ---------- |
| **connection** | _who is this?_      | the package, once, at connect    | no         |
| **checkpoint** | _where was I?_      | your stream handler, as it works | constantly |

That's the whole package. Everything else — eviction, replay, ping/pong, rebuilding the
socket map — is internal and never surfaces.

**Three rules:**

1. Every streaming handler is **re-run from the top** when the object wakes. If it has
   resumable progress, read its checkpoint first and continue from it.
2. Sticky notes are **small**. In the socket attachment (the default) Cloudflare gives ~2 KB
   per socket, shared by the connection value _and_ every in-flight stream on that socket.
   Store a cursor, never a payload — or move them to SQLite (see _Where stream state lives_).
3. `Rpc.websocket.checkpoint` only remembers inside a WebSocket-server stream. Anywhere else
   (in-process, http, a non-streaming handler) it simply remembers nothing: `get` finds
   `None` and `put`/`clear` do nothing, so the same handler runs on every Transport.

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
import { Rpc, RpcGroup } from 'effect/rpc';
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
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

const CounterObject = Cloudflare.DurableObject(
  'CounterObject',
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      const rpc = yield* Rpc.websocket.server(
        CounterRpcs,
        makeCounterHandlers(),
        { state, upgrade: Cloudflare.upgrade },
      );

      return {
        fetch: rpc.accept,
        webSocketMessage: rpc.message,
        webSocketClose: rpc.close,
      };
    });
  }),
);
```

Note the shape: you return **three** entry points, not one `fetch`. You no longer own a
connection for its lifetime — you own callbacks that get handed sockets you don't remember.
The server speaks JSON, as `Rpc.websocket.client` does; there is nothing to configure.

`@kstackz/rpc-toolkit/alchemy`'s `DurableRpcWorker` does this wiring for you, with a
Worker in front that forwards every request to one Durable Object instance.

---

## `Rpc.websocket.checkpoint` — "where was I?"

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
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

const Cursor = Schema.Struct({ cursor: Schema.Number });

watch: () =>
  Stream.unwrap(
    Effect.gen(function* () {
      const checkpoint = yield* Rpc.websocket.checkpoint(Cursor);

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
      const checkpoint = yield* Rpc.websocket.checkpoint(Cursor);
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
  const checkpoint = yield* Rpc.websocket.checkpoint(Schema.Unknown);
  yield* checkpoint.put({ page: 3 });
  const saved = yield* checkpoint.get(); // Option<unknown>
});
```

Prefer a specific schema when the value's shape may change between deploys — see _Limitations_.

### Explicitly finishing

Completed streams are cleaned up automatically when the handler exits. Call `clear` only
when the stream stays open but has nothing more to resume from; a cleared stream is not
replayed on the next wake:

```ts
Effect.gen(function* () {
  const checkpoint = yield* Rpc.websocket.checkpoint(Cursor);
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

  const rpc = yield* Rpc.websocket.server(ChatRpcs, handlers, {
    state,
    upgrade,
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
  const rpc = yield* Rpc.websocket.server(group, handlers, { state, upgrade });
});
```

If no value was stored — never set, or it failed to decode after a shape change — the
package **does not provide the tag at all**, so your `Context.Reference`'s own
`defaultValue` applies. That's why the tag carries the fallback and the API has no
`default` option.

---

## Where stream state lives

The sticky notes live in a **Stream Store**, chosen with the server's `streams` option.

| store                                       | where                                                                            | limit            |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- |
| `Rpc.websocket.streams.attachment()`        | the socket attachment (default; nothing to configure)                            | ~2 KB per socket |
| `Rpc.websocket.streams.sqlite({ storage })` | rows in the Durable Object's own SQLite; the attachment keeps only the client id | the DO's storage |

A few streams carrying a JWT in their headers already overflow 2 KB. Then use SQLite:

```ts
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

// raw workerd, inside the Durable Object class
const rpc =
  yield *
  Rpc.websocket.server(Api, handlers, {
    ...Rpc.websocket.fromDurableObjectState(ctx),
    streams: Rpc.websocket.streams.sqlite({ storage: ctx.storage }),
  });

// DurableRpcWorker
DurableRpcWorker<Self>()(
  'Api',
  {
    main: import.meta.filename,
    schema: Api,
    streams: (state) =>
      Rpc.websocket.streams.sqlite({ storage: state.raw.storage }),
  },
  handlers,
);
```

- It is built on `@kstackz/std-toolkit` (a peer) and needs a SQLite-backed Durable Object class.
- It creates its table (`rpc_stream_store`, or `tableName`) on first use with std-toolkit's
  `SQLite.setup`, which is idempotent; no migration step.
- Each socket's record and each open stream (request with headers, plus checkpoint) is a row,
  partitioned by client id. Checkpoints must be JSON values.
- Rows are hard-deleted, never soft-deleted: a stream's row when it ends (exit, interrupt, or
  `clear`), a socket's rows when it closes, and on every boot the rows of any socket that is
  no longer live (a close that never arrived, e.g. during a deploy). No timers.

Either store follows one rule: **a live socket without a record is closed** with
`Rpc.websocket.RESUME_LOST` (4000, `resume lost`). Its streams are not replayed; the client
reconnects and resubscribes from its own cursor. The record is written in `accept`, before
the 101 goes back, so a new socket always has one. For the attachment store, an attachment
that cannot be decoded counts as missing.

---

## What happens behind the scenes

| moment                       | what the package does                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`                     | runs `initial`, then `Cloudflare.upgrade()` (which calls `state.acceptWebSocket`), assigns a client id, writes the socket's record to the Stream Store                     |
| every boot                   | `state.getWebSockets()`, loads each socket's record, closes those without one, and has the store forget sockets that are gone — same code on a cold start and after a wake |
| a stream request arrives     | persists the request message in the Stream Store and provides the checkpoint scoped to it                                                                                  |
| a non-stream request arrives | nothing persisted — it completes within one wake                                                                                                                           |
| wake-up                      | replays every persisted request, with `InvocationKind` set to `replay`, before processing the message that woke it                                                         |
| stream completes             | drops the persisted request; nothing left to replay                                                                                                                        |
| socket closes                | the Stream Store forgets the socket and every stream on it                                                                                                                 |
| idle                         | ping/pong is registered as a Cloudflare **auto-response**, answered at the edge without waking the object                                                                  |

---

## Limitations

**~2 KB of state per socket with the default store.** Cloudflare caps `serializeAttachment`.
With `streams.attachment()` that budget is shared by the connection value and the persisted
request (headers included, so bearer tokens count) + checkpoint of _every_ in-flight stream
on the socket. Exceeding it fails at write time — mid-stream, not at deploy time. Store
cursors, not data, or use `streams.sqlite`. Verify the current cap in Cloudflare's docs.

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

**Beta surface.** Built on `effect/rpc`. The peer range will need bumping as the
beta moves.

**Raw-workerd path is untested.** `fromDurableObjectState` is typechecked but the app here
runs the alchemy path, so that adapter has no coverage yet.

---

## API

```ts
Rpc.websocket.server<Rpcs, E, R, A>(
  group: RpcGroup.RpcGroup<Rpcs>,
  handlers: Layer.Layer<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>, E, never>,
  options: {
    state: HibernationState<R>
    upgrade: Upgrade<R>
    connection?: {
      tag: Context.Reference<A>
      initial: (request: HttpServerRequest) => Effect<A, HttpServerResponse>
      schema?: Schema.Codec<A, unknown>
    }
    streams?: StreamStore // default: Rpc.websocket.streams.attachment()
  },
): Effect<{
  accept: Effect<HttpServerResponse>
  message: (socket: HibernatingSocket, data: string | ArrayBuffer) => Effect<void>
  close: (socket: HibernatingSocket, code: number, reason: string) => Effect<void>
}>

Rpc.websocket.checkpoint<S extends Schema.Top>(schema: S): Effect<{
  get: () => Effect<Option<S['Type']>, SchemaError, S['DecodingServices']>
  put: (value: S['Type']) => Effect<void, SchemaError, S['EncodingServices']>
  clear: Effect<void>
}>

Rpc.websocket.InvocationKind: Context.Reference<'fresh' | 'replay'>

Rpc.websocket.fromDurableObjectState(state: DurableObjectState): {
  state: HibernationState
  upgrade: Upgrade
}

Rpc.websocket.RESUME_LOST: 4000

Rpc.websocket.streams.attachment(): StreamStore
Rpc.websocket.streams.sqlite(options: {
  storage: DurableObjectStorage // ctx.storage, or alchemy's state.raw.storage
  tableName?: string            // default "rpc_stream_store"
}): StreamStore
```

`StreamStore` is the port both stores implement — `connect`, `load`, `start`,
`getCheckpoint`, `putCheckpoint`, `end`, `forget`, `reconcile` — so another backend can be
plugged in.
