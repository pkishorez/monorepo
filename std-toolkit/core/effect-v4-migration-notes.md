# @std-toolkit/core — Effect v4 migration notes

Migrated from Effect v3 to `4.0.0-beta.78`. No public subpath exports changed
shape (`.`, `./server`, `./client`, `./rpc`, `./command` all compatible). No
tests removed or skipped (35 pass).

## Import-path moves (folded packages → core)

- `@effect/rpc` → `effect/unstable/rpc` (`Rpc`, `RpcGroup`, `RpcServer`,
  `RpcSerialization`, `RpcClient`).
- `@effect/rpc/RpcClient` `Protocol` → `RpcClient.Protocol` from
  `effect/unstable/rpc`.
- `@effect/rpc/RpcClientError` → `effect/unstable/rpc/RpcClientError`.
- `@effect/rpc/RpcMessage` → `effect/unstable/rpc/RpcMessage`.
- `@effect/platform` `Socket` → `effect/unstable/socket` (the socket module is
  **not** under `http`; it lives at `effect/unstable/socket`).

## API-shape changes (the real work)

### RPC serialization

- `RpcSerialization.RpcSerialization` is now a `Context.Service`; the parser
  factory renamed `unsafeMake()` → `makeUnsafe()`.

### RpcServer / RpcGroup

- `RpcServer.makeNoSerialization(rpcs, { onFromServer, disableClientAcks })`
  unchanged in shape; returned `.write(clientId, message)` unchanged. `Rpc.make`
  unchanged.

### RpcClient.Protocol (client/websocket.ts — heaviest)

- `Protocol` is now a `Context.Service` class (was a `Context.Tag`). The service
  shape type is `RpcClient.Protocol['Service']` (replaces v3 `Protocol['Type']`).
- `Protocol.make(fn)` callback signature changed: `fn(writeResponse, clientIds)`.
  `writeResponse` now takes `(clientId, response)` (was a single `response`).
  Server responses must be **broadcast** to every id in `clientIds`
  (`Effect.forEach(clientIds, (id) => writeResponse(id, response))`).
- The returned protocol's `send` now takes `(clientId, request)` (was
  `(request)`).
- `RpcClientError` reshaped: it is a `Schema.ErrorClass` whose single `reason`
  field is a **union of error reason classes** (`SocketErrorReason`,
  `HttpClientErrorSchema`, `WorkerErrorReason`, `RpcClientDefect`). The old
  `{ reason: 'Protocol', message, cause }` flat shape is gone. Decode/protocol
  failures are now `new RpcClientError({ reason: new RpcClientDefect({ message,
cause }) })`. `RpcClientDefect` is exported from
  `effect/unstable/rpc/RpcClientError`.

### Socket errors

- `Socket.SocketGenericError` is gone. Open/timeout failures are now
  `new Socket.SocketError({ reason: new Socket.SocketOpenError({ kind:
'Timeout' | 'Unknown', cause }) })`.
- `Socket.SocketCloseError` reshaped to `{ code, closeReason? }` and is wrapped
  in `Socket.SocketError({ reason })` (was thrown directly with
  `{ reason: 'Close', code }`).
- Transient-error detection: `Cause.failureOption(cause)` →
  `Cause.findError(cause)` (returns a `Result`, use `Result.isSuccess` +
  `.success`). Match on `reason._tag === 'SocketOpenError'` instead of the old
  string `reason` values.

### Effect / Latch / Cause

- `Effect.tapErrorCause` → `Effect.tapCause`.
- `Effect.unsafeMakeLatch()` → `Latch.makeUnsafe()` (new `Latch` module);
  `latch.unsafeClose()` → `latch.closeUnsafe()`. `latch.await` / `latch.open`
  unchanged.

### Schema (consumed from migrated eschema + core's own schemas)

- `Schema.Schema<T, T>` → `Schema.Codec<T, T>` (single-param Schema; pin services
  to `never` via `Codec`). `Schema.Schema.Any` → `Schema.Top`.
- `Schema.Record({ key, value })` → `Schema.Record(key, value)` (positional).
- `Schema.Union(a, b, …)` → `Schema.Union([a, b, …])` (array arg).
- `Schema.Literal('a','b',…)` (multiple) → `Schema.Literals(['a', …])`.
- `Schema.TaggedError<Self>()(tag, fields)` →
  `Schema.TaggedErrorClass<Self>()(tag, fields)`.
- `Schema.partial(struct)` →
  `struct.mapFields(Struct.map(Schema.optional))` (import `Struct`).
- `Schema.Set(x)` → `Schema.ReadonlySet(x)`. The decoded value is a real `Set`
  at runtime but typed `ReadonlySet`; mutating sites (`.add`/`.delete`) copy via
  `new Set(...)`.

### Services

- `Context.Tag('Id')<Self, Shape>()` → `Context.Service<Self, Shape>()('Id')`
  (type params first, id passed to the returned constructor). A custom static
  `make(...)` returning a `Layer` coexists fine on the class form.

### Tests

- `Schema.decodeUnknown` → `Schema.decodeUnknownEffect` (the bare name was
  repurposed in v4). For simple primitive/struct schemas the decode services
  resolve to `never`, so `Effect.runPromise` still type-checks.
- `Effect.either` → `Effect.result`; result tag `'Left'` → `'Failure'`.

## Net-line delta

`git diff --shortstat`: 11 files changed, +143 / −111 (net +32). The positive
delta is import-block reformatting (single-line imports became multi-line under
the formatter) plus the client/websocket.ts `RpcClientError` / `SocketError`
reconstruction, which require nested error-class constructors where v3 used flat
objects. No new abstractions or types were introduced.
