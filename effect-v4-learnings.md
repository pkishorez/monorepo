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

### Collections / Order (transferable, found migrating `cache`)

- **`SortedMap` is removed from `effect` core in v4.** There is no sorted-map
  collection (core has `HashMap`, `MutableHashMap`, `TxHashMap`, `RcMap`,
  `LayerMap`, `FiberMap` — none ordered). If a `SortedMap` was only a secondary
  index to find min/max by a key, drop it and compute the extremum on demand by
  scanning the primary structure with an `Order` comparator (simpler, no
  reinvented primitive).
- **`Order.string` → `Order.String`** (capitalized in v4; likewise the other
  primitive orders). Compose with `Order.mapInput(Order.String, (x) => x.key)`.

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

### CLI (folded `@effect/cli` → `effect/unstable/cli`, found migrating `monoverse`)

The CLI API changed **shape**, not just import path. Module split: `Options` →
`Flag`, `Args` → `Argument`. `Command` and `Prompt` keep their names.

- **`Args.text({ name })` → `Argument.string(name)`** (positional names are a
  plain string arg now, no options object). Other `Args.*` → `Argument.*`.
- **`Options.*` → `Flag.*`:** `Options.text` → `Flag.string`,
  `Options.boolean` → `Flag.boolean`, `Options.choice(name, choices)` →
  `Flag.choice(name, choices)` (still returns the literal union
  `Flag<Choices[number]>`). Combinators move too:
  `Options.withAlias/withDefault/optional` → `Flag.withAlias/withDefault/
optional` (same pipe semantics).
- **`Prompt` is unchanged:** still a yieldable `Effect` (`yield* Prompt.select(
{ message, choices: [{ title, value }] })`), `Prompt.select/confirm/text/…`
  same option shapes.
- **`Command.make(name, config, handler)` / `withSubcommands` / pipe composition
  unchanged.** Config record maps keys → `Flag`/`Argument` values as before.
- **`Command.run(command, { name, version })` → `Command.run(command,
{ version })`:** the `name` field is **gone**, and the result is now an
  **`Effect`** that reads argv from the `Stdio` service — not a
  `(argv) => Effect` function. So `cli(process.argv).pipe(...)` becomes
  `cli.pipe(...)`; you no longer thread `process.argv`. `Command.runWith(cmd,
{ version })(argvArray)` is the explicit-args form (for tests).
- **`CliConfig` is removed** — no v4 equivalent for
  `CliConfig.layer({ isCaseSensitive, showBuiltIns, showTypes })`. Drop the
  layer. Consequence: subcommand/flag matching is **case-sensitive** in v4 and
  there is no opt-out via this API.
- **`Command.Environment` = `FileSystem | Path | Terminal |
ChildProcessSpawner | Stdio`.** Provide it on Node with
  `NodeServices.layer` (see Platform below).

### Platform-node (surviving package, found migrating `monoverse`)

- **`NodeContext` is gone → use `NodeServices.layer`.** `NodeServices.layer`
  provides the whole bundle (FileSystem, Path, Stdio, Terminal,
  ChildProcessSpawner, Crypto), which is exactly what `Command.Environment`
  needs. `NodeStdio.layer` / `NodeTerminal.layer` exist standalone if you only
  need pieces.
- **`NodeRuntime.runMain` unchanged** (`runMain(opts)(effect)` /
  `runMain(effect, opts)`), but the effect must be fully provided
  (`Effect<A, E>`, no `R`).

### Service (`Effect.Service` → `Context.Service`, found migrating `monoverse`)

- **`Effect.Service<Self>()(id, { succeed: {...} })` →
  `Context.Service<Self>()(id, { make: Effect.succeed({...}) })`.** The
  `succeed` / `effect` config keys are gone; pass a single `make` (an `Effect`
  or a factory `(...args) => Effect`). When `make`'s `R` is `never` it's exposed
  as a static `this.make`.
- **No auto-generated `.Default` layer.** Build it yourself:
  `static readonly layer = Layer.effect(this, this.make)` (add `Layer.provide`
  for deps; the v3 `dependencies` option no longer exists). The class stays
  yieldable as a tag (`yield* MyService`). Rename `MyService.Default` call sites
  to `MyService.layer`.

### Effect.try (found migrating `monoverse`)

- **`Effect.try(thunk)` → `Effect.try({ try, catch })`.** The bare-thunk
  overload is gone; only the `{ try, catch }` object form remains (same as
  `Effect.tryPromise`). When a downstream `Effect.catch` recovers, a passthrough
  `catch: (cause) => cause` keeps the original error.

### Service / Context / FiberRef / Stream / Schema (found migrating `db-sqlite`)

- **`Context.Tag(id)<Self, Shape>()` → `Context.Service<Self, Shape>()(id)`.**
  Plain `Context.Tag` class services (not just `Effect.Service`) migrate to
  `Context.Service` — type params first, id string as the call argument. A
  lingering v3 Tag surfaces as misleading "`[Symbol.iterator]` missing" errors at
  `yield* MyTag` sites and as `implicit any` on `Layer.succeed(MyTag, {...})`
  handler params (the v3 Tag isn't a v4 service key, so its shape doesn't infer).
- **Custom `FiberRef.unsafeMake<T>(init)` → `Context.Reference<T>(id, {
defaultValue: () => init })`** (`effect` no longer exports `FiberRef` at all).
  A `Reference`'s value is **fixed for the scope it's provided to** — there is no
  in-fiber `FiberRef.set`. Read with `yield* MyRef`; scope a value with
  `Effect.provideService(MyRef, value)`. For a ref used as a mutable accumulator
  across an effect (old `get`/`set`-replace pattern), provide a `Some(mutable
container)` once and **mutate it in place** (e.g. `ref.value.push(x)`); keep a
  local handle to read results back after the scoped effect completes.
- **`Effect.andThen(fn)` rejects plain value-returning functions.** In v4
  `Effect.andThen` only accepts an `Effect` or `() => Effect`; a mapping function
  returning a non-Effect (e.g. `Option.getOrNull`, `A | null`) must use
  `Effect.map` instead.
- **`Stream.paginateChunkEffect` removed → `Stream.paginate(s, f)`.** The page
  fn returns `Effect<[ReadonlyArray<A>, Option<S>]>` (emits flattened array
  elements, **not** `Chunk`). To keep emitting a whole batch as one element, wrap
  it: `[[items], nextState]` instead of `Chunk.of(items)`.
- **`Schema.transform(from, to, { decode, encode })` →
  `from.pipe(Schema.decodeTo(to, { decode: SchemaGetter.transform(fn), encode:
SchemaGetter.transform(fn) }))`.** `decodeTo`'s transformation arg is a
  `{ decode: Getter, encode: Getter }` (build getters with `SchemaGetter.transform`
  for pure fns) — passing a `SchemaTransformation.transform(...)` result is the
  wrong shape for this overload.
- **`Struct.omit(k)` and `Schema.extend(struct)` are gone.** A v4 `Schema.Struct`
  exposes `.fields`; reshape by spreading: `Schema.Struct({ ...Base.fields, k:
NewSchema })` (drop/override keys directly).

### Platform / Stream / Effect (found migrating `db-dynamodb`)

- **`@effect/platform` `FileSystem` / `Path` are now TOP-LEVEL core modules**
  (`effect/FileSystem`, importable as `import { FileSystem } from 'effect'`) —
  **not** under `effect/unstable/*`. Only the HTTP/HttpApi pieces live under
  `effect/unstable/http` (e.g. `HttpClient`); `client.get`/`response.status`/
  `response.json` are unchanged. `@effect/platform-node` survives standalone
  (`NodeFileSystem`, `NodeHttpClient`).
- **`Stream.runCollect` now returns `Effect<Array<A>>`** (was `Chunk`). Drop any
  trailing `Effect.map(Chunk.toArray)` / `Chunk.toArray(result)` adapters.
- **`Effect.catchAll` → `Effect.catch`** (recovers from all typed errors; same
  callback shape `(error) => Effect`).
- **`Effect.either` → `Effect.result`** (already noted under Effect/Cause):
  consumers must switch `_tag === 'Right'|'Left'` → `'Success'|'Failure'` and
  `.right`/`.left` → `.success`/`.failure` (including runtime `expect` asserts).
- **`Schema.partial(struct)` → `struct.mapFields(Struct.map(Schema.optional))`**
  (already noted under `core`; confirmed `.mapFields` works on
  `Schema.Struct<...>` returned by eschema's `.schema`).

### Semaphore / Fork / SubscriptionRef (found migrating `tanstack`)

- **`Effect.makeSemaphore(n)` → `Semaphore.make(n)`** (new top-level `Semaphore`
  module; `Semaphore.makeUnsafe(n)` is the sync form). The `Effect.Semaphore`
  type moved to `Semaphore.Semaphore`. The instance shape
  (`withPermits(n)(effect)`, `withPermit`, `withPermitsIfAvailable`) is unchanged.
- **`Effect.fork(effect)` → `Effect.forkChild(effect)`** (child fiber tied to the
  current fiber; `Fiber.join`/`Fiber.await` unchanged). `Effect.forkScoped` is the
  scope-tied form. A lingering `Effect.fork` widened the enclosing gen's `R` to
  `unknown`, surfacing as a misleading "`Effect<…, unknown>` not assignable to
  `Effect<…, never>`" error at the `Effect.runCallback` call site.
- **`SubscriptionRef.SubscriptionRefTypeId` is gone → use
  `SubscriptionRef.isSubscriptionRef(u)`** (predicate) to test for a
  SubscriptionRef instead of the `TypeId in obj` symbol check.
- **`Effect.runCallback` is unchanged** (returns a cancel/interrupt function).
- **`Effect.forkDaemon(effect)` → `Effect.forkDetach(effect)`** (detached daemon
  fiber, not tied to the parent fiber's scope; `forkChild` is the scoped child
  form). Found migrating `tanstack-sync`.
- **`Fiber.RuntimeFiber<A, E>` is gone → use `Fiber.Fiber<A, E>`** (the single
  `Fiber.Fiber` interface is the fiber type now). `Fiber.interrupt(fiber)`
  unchanged (returns `Effect<void>`). Found migrating `tanstack-sync`.

### HttpApi (folded `@effect/platform` HttpApi → `effect/unstable/httpapi`, found migrating `lotel`)

Module names are unchanged (`HttpApi`, `HttpApiEndpoint`, `HttpApiGroup`,
`HttpApiBuilder`, `HttpApiSchema`), but the **shape** changed. `HttpMiddleware`
moved to `effect/unstable/http`.

- **`HttpApiEndpoint` is now an options-object constructor, not fluent.**
  `HttpApiEndpoint.post(name, path).setPayload(p).addSuccess(s).addError(e1)
.addError(e2)` → `HttpApiEndpoint.post(name, path, { payload, success, error })`.
  Multiple errors go in `error: [E1, E2, E3]` (array). `setUrlParams(s)` →
  `query: s`. Other slots: `params`, `headers`.
- **`HttpApiEndpoint.del` is exported as `delete`** (reserved-word export). Call
  `HttpApiEndpoint.delete(...)`. `get`/`post` unchanged.
- **Handler context field `urlParams` → `query`.** In `handlers.handle(name,
({ query: { ... } }) => …)`. `payload`, `request` unchanged.
- **`HttpApiSchema.annotations({ status: n })` is gone.** v4 has
  `HttpApiSchema.status(code)` — a pipeable that does
  `.annotate({ httpApiStatus: code })` (accepts a number or a status literal like
  `"Created"`). For a `Schema.TaggedErrorClass`/`ErrorClass` 3rd-arg annotations
  object, pass `{ httpApiStatus: 400 }` directly instead of piping.
- **`HttpApiBuilder.api(api)` → `HttpApiBuilder.layer(api)`** (registers the
  api's routes into an `HttpRouter`; returns a `Layer` needing
  `HttpRouter | HttpPlatform | FileSystem | Path | Etag.Generator` + the group
  services). `HttpApiBuilder.group(api, name, build)` is unchanged.
- **`HttpApiBuilder.serve(...)` is removed.** Serve an HttpApi via the router:
  `HttpRouter.serve(appLayer, { middleware })` where `appLayer` is the
  `HttpApiBuilder.layer(api)` (with handler group layers provided). The result
  needs `HttpServer.HttpServer` — on Node provide
  `NodeHttpServer.layer(createServer, { host, port })` (this also bundles
  `NodeServices`, `HttpPlatform`, `Etag.Generator`). The old logger+cors wrap
  (`HttpMiddleware.logger(HttpMiddleware.cors()(app))`) becomes the `middleware`
  option of `HttpRouter.serve`. `HttpRouter.serve` already adds `logger` unless
  `disableLogger: true`.

### Observability / OTLP (folded out of `@effect/opentelemetry`, found migrating `code`)

- **The OTLP exporters moved from `@effect/opentelemetry` into core
  `effect/unstable/observability`.** The surviving `@effect/opentelemetry` v4
  package only exports `Logger`, `Metrics`, `NodeSdk`, `Resource`, `Tracer`,
  `WebSdk` — **not** `Otlp`, `OtlpLogger`, `OtlpTracer`, `OtlpMetrics`,
  `OtlpSerialization`. Re-import those from `effect/unstable/observability`;
  the module names and option shapes are unchanged (`OtlpLogger.layer({ url,
resource, maxBatchSize, exportInterval })`, `Otlp.layerJson({ baseUrl,
resource, *ExportInterval })`, `OtlpSerialization.layerJson`). `Otlp.layerJson`
  still bundles `OtlpSerialization` internally. If OTLP was the only use of
  `@effect/opentelemetry`, drop the dependency.

### Stream / PubSub (found migrating `code`)

- **`Stream.unwrapScoped` is gone.** The v3
  `Stream.unwrapScoped(Effect.map(PubSub.subscribe(p), Stream.fromQueue))`
  pattern collapses to **`Stream.fromPubSub(p)`** (v4 streams a PubSub directly;
  it manages the scoped subscription internally). `Stream.fromQueue` still exists
  for raw `Queue.Dequeue`s. `Stream.unwrap` (non-scoped) remains.

### Schema `optionalWith({ as: 'Option' })` (found migrating `code`)

- **`Schema.optionalWith(s, { as: 'Option' })` has no built-in v4 form** (the
  decision tree in `migration/schema.md` only covers `exact`/`default`/
  `nullable`). Reproduce the "absent key → `Option.none()`, present →
  `Option.some(v)`, always-present decoded type" behaviour with:
  `Schema.optionalKey(s).pipe(Schema.decodeTo(Schema.Option(s), {
decode: SchemaGetter.transformOptional(Option.some),
encode: SchemaGetter.transformOptional(Option.flatten) }))`. Wrap it in a small
  `asOption` helper if used repeatedly.
- **`Schema.withDecodingDefaultType` takes an `Effect`, not a thunk.**
  `optionalWith(s, { default: () => 1000 })` →
  `s.pipe(Schema.withDecodingDefaultType(Effect.succeed(1000)))` (pass the
  `Effect` value directly).

### Layer / Context (more, found migrating `lotel`)

- **`Layer.scoped(tag, effect)` is removed → use `Layer.effect(tag, effect)`.**
  `Layer.effect` now types `R` as `Exclude<R, Scope.Scope>`, so a scoped
  acquire/release effect (or one that runs `Layer.build`) works directly.
- **`Context.unsafeGet(ctx, tag)` → `Context.getUnsafe(ctx, tag)`** (Unsafe
  suffix moved to the end, matching the `makeUnsafe` convention).

### Schema.Union / RpcServer.layer (found migrating `finances`)

- **`Schema.Union(a, b, c)` → `Schema.Union([a, b, c])`.** `Schema.Union` now
  takes a single **array** of members (optional 2nd options arg), not variadic
  args. A lingering variadic call surfaces as "Expected 1-2 arguments, but got
  N". (`Schema.Literals([...])` and `Schema.Record(key, value)` positional are
  already noted above.)
- **`RpcServer.layer(group)` leaves an `any` in its layer requirement.** Its
  `R` is `Protocol | Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> |
Rpc.ServicesServer<Rpcs>`, and `Middleware`/`ServicesServer` resolve to `any`
  even for a trivial single-rpc group. After `Layer.provide`-ing every real dep
  (handlers, protocol, serialization, socket server, db), the built layer's `R`
  stays `any`, which `NodeRuntime.runMain` rejects (`any` not assignable to
  `never`, overload "no properties in common"). Narrow with a single cast at the
  provide site: `eff.pipe(Effect.provide(RpcLive)) as Effect.Effect<void>` (or
  annotate the provided layer's R to `never`). Runtime is unaffected — the layer
  is fully provided; this only papers over upstream `any` widening.
- **`@effect/platform-node` `NodeSocketServer` / `NodeRuntime` survive
  unchanged in v4** (`NodeSocketServer.layerWebSocket({ server, path })`,
  `NodeRuntime.runMain`), as does `@effect/platform-browser`
  `BrowserSocket.layerWebSocket(url)`. The rpc protocol layers
  (`RpcServer.layerProtocolSocketServer`, `RpcClient.layerProtocolSocket`,
  `RpcSerialization.layerNdjson`) moved to `effect/unstable/rpc` but keep the
  same shapes.
