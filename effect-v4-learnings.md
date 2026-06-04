# Effect v4 migration learnings

Shared, append-only notes for migrating this monorepo's first-party packages
from Effect v3 to v4 (`4.0.0-beta.78`). **Read this file before starting a
package, and append any new transferable learning when you finish** (dedup by
symbol / topic — extend an existing entry rather than duplicating it).

## Pinned version

Everything Effect-related is pinned to the literal `4.0.0-beta.78` (no pnpm
catalog). All Effect ecosystem packages share one version in v4.

## Folded packages → core module mapping

These v3 packages have **no standalone v4 release**; their functionality now
lives inside the `effect` core package under `effect/unstable/*`. Remove the
package dependency and re-import from core.

| v3 package                          | v4 import path                                     |
| ----------------------------------- | -------------------------------------------------- |
| `@effect/rpc`                       | `effect/unstable/rpc`                              |
| `@effect/platform` (HttpApi / http) | `effect/unstable/httpapi` + `effect/unstable/http` |
| `@effect/cli`                       | `effect/unstable/cli`                              |
| `@effect/sql`                       | `effect/unstable/sql`                              |

Note: `effect/unstable/*` modules may take breaking changes in minor releases
(see `repos/effect-smol/MIGRATION.md`). Other unstable modules include `ai`,
`cluster`, `devtools`, `eventlog`, `jsonschema`, `observability`,
`persistence`, `process`, `reactivity`, `schema`, `socket`, `workflow`,
`workers`.

## Surviving standalone packages

These remain separate packages in v4 and are bumped to the matching beta:

- `@effect/platform-node` — `4.0.0-beta.78`
- `@effect/platform-browser` — `4.0.0-beta.78`
- `@effect/opentelemetry` — `4.0.0-beta.78`
- `@effect/vitest` — `4.0.0-beta.78`

## Reference

- Official v3→v4 guide: `repos/effect-smol/MIGRATION.md` (read-only vendored
  copy). Key sub-guides: services (`Context.Tag` → `Context.Service`), cause
  (flattened), error-handling (`catch*` renames), forking, yieldable,
  fiberref (`FiberRef` → `Context.Reference`), runtime (`Runtime<R>` removed),
  scope, equality, schema.

## Per-package learnings

### Schema (transferable, found migrating `eschema`)

- **`Schema.Schema<T>` is single-parameter now.** The 3-param
  `Schema.Schema<A, E, R>` is gone; the codec type is
  `Schema.Codec<Type, Encoded, RD, RE>`. Replace `Schema.Schema<A, E, never>`
  with `Schema.Codec<A, E>`. `Schema.Schema<T>` (one arg) still exists but
  inherits `unknown` decode/encode services from `Top` — if a `never`-service
  schema is needed (e.g. to satisfy `Effect<…, …, never>` call sites), use
  `Schema.Codec<T, T>` instead.
- **Type/Encoded extractors split by namespace:** `Schema.Schema.Type<S>` is
  fine, but `Encoded` moved to `Schema.Codec.Encoded<S>` (also
  `Schema.Codec.DecodingServices` / `EncodingServices`).
- **`Struct.Fields` is `Record<PropertyKey, Top>`.** A field union of
  `Schema | PropertySignature` collapses to `Schema.Top`.
- **Effectful decode/encode gained an `Effect` suffix:** `Schema.decodeUnknown`
  → `Schema.decodeUnknownEffect`, `Schema.encode` → `Schema.encodeEffect`
  (likewise `decode`/`encodeUnknown`). The bare names were repurposed.
- **`Schema.transform(from, to, { decode, encode })`** →
  `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({ … })))`.
  For effectful transforms use a `SchemaGetter.transformOrFail` getter that
  returns `Effect<T, SchemaIssue.Issue, R>`.
- **`Schema.Literal('a', 'b')` (multiple)** → `Schema.Literals(['a', 'b'])`.
  `Schema.Literal` now takes a single literal.
- **`Schema.optionalWith` is gone** (see `migration/schema.md` decision tree):
  `{ exact: true }` → `Schema.optionalKey(s)`; `{ default }` →
  `s.pipe(Schema.withDecodingDefaultType(Effect.succeed(d)))`;
  `{ exact: true, default }` → `withDecodingDefaultTypeKey`.
- **Annotations:** `.annotations(a)` → `.annotate(a)`. The JSON-Schema/`$defs`
  identifier is now a first-class `{ identifier }` annotation; annotating _any_
  schema with `identifier` makes it a `#/$defs/<identifier>` reference.
- **JSON Schema generation:** `JSONSchema.make(schema)` →
  `Schema.toJsonSchemaDocument(schema)`, returning
  `{ dialect, schema, definitions }` (root in `.schema`, `$defs` in
  `.definitions`). The `JSONSchema` module is now `JsonSchema` and its
  `JsonSchema7*` types are gone (`JsonSchema.JsonSchema` is an open record).
- **`Schema.declare` reshaped + `SchemaAST.SurrogateAnnotationId` removed.**
  `declare(is, ann)` is now a type-guard constructor; `declareConstructor` is
  the parametric codec form. To wrap arbitrary effectful decode/encode as a
  permissive codec (the old `declare(... , { decode, encode }, { surrogate })`
  pattern), use
  `Schema.Unknown.pipe(Schema.decodeTo(Schema.Unknown, { decode, encode }))`
  with `SchemaGetter.transformOrFail` adapters, and an `{ identifier }`
  annotation for the `$defs` key. Failures map to `SchemaIssue.InvalidValue`.

### Effect / Cause (transferable)

- **`Effect.gen(this, fn)` → `Effect.gen({ self: this }, fn)`** (self must be
  wrapped in an options object).
- **`Effect.either` → `Effect.result`** (returns `Result.Result`; tags are
  `'Success'`/`'Failure'`, not `'Right'`/`'Left'`). `Effect.exit` still exists
  for the `Exit` form.
- **`Cause` is flattened:** no `cause._tag === 'Fail'` / `cause.error`. Extract
  with `Cause.findErrorOption(cause)` (→ `Option`) or `Cause.findError(cause)`
  (→ `Result`). `Exit` still uses `_tag: 'Success' | 'Failure'` with
  `.value` / `.cause`.
- **`Data.TaggedError(...)` is unchanged** and instances remain yieldable
  (`yield* new MyError({...})`).
- **`Cause.isInterrupted` → `Cause.hasInterrupts`** (flattened Cause; also
  `hasFails`, `hasInterruptsOnly`). Use these instead of `cause._tag` checks.

### Schema (more, found migrating `trace-viewer`)

- **`Schema.Record({ key, value })` → `Schema.Record(key, value)`** (positional
  args; optional 3rd `keyValueCombiner` options object).
- **`Schema.Literal('a', 'b')` → `Schema.Literals(['a', 'b'])`** (already noted
  above; confirmed for the value-codec case too).
- **`Schema.decodeUnknownEither` → `Schema.decodeUnknownResult`** (returns
  `Result`, tags `'Success'`/`'Failure'` not `'Right'`/`'Left'`). Also
  `decodeUnknownExit` / `decodeUnknownOption` variants exist.

### SubscriptionRef / Stream / Tracer / Array (found migrating `trace-viewer`)

- **`SubscriptionRef` is no longer method-based.** `ref.modify(fn)` →
  `SubscriptionRef.modify(ref, fn)`; `ref.changes` →
  `SubscriptionRef.changes(ref)` (returns a value `Stream<A>`).
- **`Stream.runForEachChunk` removed; `Stream.chunks` now emits
  `NonEmptyReadonlyArray`** (not `Chunk`). To process per-batch, use
  `Stream.chunks` + `Stream.runForEach`. Replace `Chunk.last` with
  `Array.lastNonEmpty` (or `Array.last` → `Option`).
- **`Layer.setTracer(t)` removed.** `Tracer.Tracer` is a `Context.Reference`;
  install with `Layer.succeed(Tracer.Tracer, t)`.
- **`Tracer.make({ span })` span callback takes a single options object** now:
  `{ name, parent, annotations, links, startTime, kind, root, sampled }` (was
  positional). The v3 `context` field is renamed `annotations`
  (`Context.Context<never>`) on both span options and the returned `Span`. The
  tracer-level `context` hook is now optional with a `(primitive, fiber)`
  signature — omit unless needed.

### Scope / Fiber (transferable, found migrating `use-effect-ts`)

- **`Scope.extend(scope)` → `Scope.provide(scope)`.** Same dual signature
  (`(value) => (self) => …` and `(self, value)`); pipes a scope into an
  effect's requirements (`Exclude<R, Scope>`). Leaving the old name in place
  also surfaced as misleading downstream "unknown not assignable" errors
  (e.g. `useState` setters) because `extend` typed its result as `unknown`.
- **`Scope.CloseableScope` → `Scope.Closeable`** (the closeable scope type).
  `Scope.make()` still returns it; `Scope.close(scope, exit)` unchanged.
- **`Fiber.interrupt(fiber)` now returns `Effect<void>`**, not
  `Effect<Exit>`. To get the exit, interrupt then `Fiber.await(fiber)`
  (`Fiber.await` returns `Effect<Exit<A, E>>`). `Fiber.join` unchanged.
- **Unchanged in v4:** `Exit.void`, `FiberHandle.make/run`,
  `FiberSet.make/run` (both `make` still need `Scope.Scope`, both `run` keep
  the dual `(self, eff)` / curried `(self)(eff)` forms returning
  `Effect<Fiber>`), and all `Effect.runFork/runSync/runPromise/runPromiseExit`.

### RPC / Socket (transferable, found migrating `core`)

Folded `@effect/rpc` → `effect/unstable/rpc`; the v3 `@effect/platform`
`Socket` → `effect/unstable/socket` (**not** under `http`). Subpaths exist:
`effect/unstable/rpc/RpcMessage`, `.../RpcClientError`.

- **`RpcSerialization.RpcSerialization` is a `Context.Service`**; the parser
  factory renamed `serialization.unsafeMake()` → `serialization.makeUnsafe()`.
  The `Parser` shape (`{ decode, encode }`) is unchanged.
- **`RpcServer.makeNoSerialization(rpcs, { onFromServer, disableClientAcks,
… })`** and its returned `.write(clientId, message)` are unchanged. `Rpc.make`
  unchanged.
- **`RpcClient.Protocol` is now a `Context.Service` class** (was a
  `Context.Tag`). Use the service-shape type `RpcClient.Protocol['Service']`
  (replaces v3 `Protocol['Type']`). `Protocol.make(fn)` callback signature is
  now `fn(writeResponse, clientIds)`: `writeResponse(clientId, response)` takes
  a client id, and server-broadcast messages must fan out over `clientIds`
  (`Effect.forEach(clientIds, (id) => writeResponse(id, response))`). The
  returned protocol's `send` is `(clientId, request) => …`.
- **`RpcClientError` reshaped to a single `reason` union.** It is a
  `Schema.ErrorClass` whose `reason` is a union of reason classes
  (`SocketErrorReason`, `HttpClientErrorSchema`, `WorkerErrorReason`,
  `RpcClientDefect`). The old flat `{ reason: 'Protocol', message, cause }` is
  gone. Protocol/decoding failures →
  `new RpcClientError({ reason: new RpcClientDefect({ message, cause }) })`
  (`RpcClientDefect` from `effect/unstable/rpc/RpcClientError`).
- **Socket errors reshaped.** `Socket.SocketGenericError` removed; open/timeout
  failures are `new Socket.SocketError({ reason: new Socket.SocketOpenError({
kind: 'Timeout' | 'Unknown', cause }) })`. `Socket.SocketCloseError` is now
  `{ code, closeReason? }` wrapped in `Socket.SocketError({ reason })`. Detect a
  transient open error via `Cause.findError(cause)` (`Result`) →
  `Result.isSuccess(r) && r.success.reason._tag === 'SocketOpenError'`
  (`Cause.failureOption` is gone; use `Cause.findError`). `socket.runRaw(handler,
{ onOpen })` and `socket.writer` are unchanged.
- **`FromServerEncoded` tags unchanged** (`Chunk`, `Exit`, `Defect`, `Pong`,
  `ClientProtocolError`; plus `ClientEnd`). `RpcMessage.constPing` / `constPong`
  unchanged.

### Effect / Latch / Schema (more, found migrating `core`)

- **`Effect.tapErrorCause` → `Effect.tapCause`.**
- **`Effect.unsafeMakeLatch()` → `Latch.makeUnsafe()`** (new top-level `Latch`
  module). `latch.unsafeClose()` → `latch.closeUnsafe()`; `latch.await` /
  `latch.open` unchanged.
- **`Schema.partial(struct)` →
  `struct.mapFields(Struct.map(Schema.optional))`** (import `Struct`;
  `Struct.map(Schema.optionalKey)` for the exact `{ exact: true }` form).
- **`Schema.Set(x)` → `Schema.ReadonlySet(x)`.** Decodes to a real `Set` at
  runtime but is typed `ReadonlySet`; copy via `new Set(...)` at mutation sites.
- **`Schema.Schema.Any` → `Schema.Top`** (constraint for "any schema").
- **`Schema.TaggedError<Self>()(tag, fields)` →
  `Schema.TaggedErrorClass<Self>()(tag, fields)`** (likewise plain
  `Schema.ErrorClass`). Instances stay yieldable.
- **`Schema.decodeUnknown` was repurposed → use `Schema.decodeUnknownEffect`**
  for the effectful decoder (mirrors the `decode`/`encode` `Effect`-suffix rule).
  For primitive/struct schemas the decode services resolve to `never`, so
  `Effect.runPromise` still type-checks.
