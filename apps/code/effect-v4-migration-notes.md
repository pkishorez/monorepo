# effect v4 migration notes — `code` app

Pinned to `4.0.0-beta.78`. App migration; no public API consumed by others.

## Import-path rewrites (folded packages)

- `@effect/rpc` → `effect/unstable/rpc` (`server.ts`, `server/api/terminal.ts`,
  `routes/internal/effect.ts`). Symbols unchanged: `RpcServer.layer`,
  `RpcServer.layerProtocolSocketServer`, `RpcSerialization.layerNdjson`,
  `RpcClient.make`, `RpcClient.layerProtocolSocket`, `Rpc.make`, `RpcGroup.make`,
  `RpcGroup.toLayer`.
- `@effect/platform` `FetchHttpClient` → `effect/unstable/http`
  (`services/telemetry.ts`, `routes/internal/telemetry.ts`).
- `@effect/platform-node` / `@effect/platform-browser` are surviving standalone
  packages — imports unchanged. `NodeSocketServer.layerWebSocket`,
  `BrowserSocket.layerWebSocket`, `NodeRuntime.runMain` unchanged.

## OTLP exporters moved out of `@effect/opentelemetry`

`@effect/opentelemetry` v4 no longer exports the OTLP exporters. `Otlp`,
`OtlpLogger`, `OtlpTracer`, `OtlpSerialization` now live in core
`effect/unstable/observability`. Rewrote both telemetry files to import from
there; option shapes (`{ url, resource, maxBatchSize, exportInterval }` /
`{ baseUrl, resource, *ExportInterval }`) are unchanged, and `Otlp.layerJson`
still bundles `OtlpSerialization`. The `@effect/opentelemetry` dependency is now
unused and was removed from `package.json`.

## Service migrations (`Context.Tag`/`Effect.Service` → `Context.Service`)

- `services/terminal.ts`: `Context.Tag('TerminalService')<Self, Shape>()` →
  extracted `Shape` into an exported `TerminalServiceShape` interface, then
  `Context.Service<TerminalService, TerminalServiceShape>()('TerminalService',
{ make })`. The old `Layer.effect(TerminalService, makeEffect)` body became the
  `make` effect; added `static layer = Layer.effect(this, this.make)` and kept the
  `TerminalServiceLive` export aliased to it (call sites unchanged).
- `routes/internal/effect.ts`: `Effect.Service<CodeClient>()('CodeClient',
{ scoped, dependencies })` → `Context.Service` with `make`, moving the v3
  `dependencies` layer into a `static layer` that `Layer.provide`s the RPC socket
  protocol stack. `CodeClient.Default` → `CodeClient.layer`.

## Schema (`domain/terminal/schema.ts`)

- `Schema.optionalWith(s, { as: 'Option' })` has no built-in v4 equivalent.
  Added a local `asOption(schema)` helper:
  `Schema.optionalKey(schema).pipe(Schema.decodeTo(Schema.Option(schema), {
decode: SchemaGetter.transformOptional(Option.some),
encode: SchemaGetter.transformOptional(Option.flatten) }))`. Decoded type stays
  `Option<T>`, always present; encode drops the key when `None`.
- `Schema.optionalWith(s, { default: () => 1000 })` →
  `s.pipe(Schema.withDecodingDefaultType(Effect.succeed(1000)))`
  (takes an `Effect` directly, not a thunk).
- `Schema.Record({ key, value })` → `Schema.Record(key, value)` (positional).
- `Schema.Literal('a', 'b')` → `Schema.Literals(['a', 'b'])`.
- `Schema.TaggedError<Self>()(...)` → `Schema.TaggedErrorClass<Self>()(...)`.

## Stream / Cause

- `Stream.unwrapScoped(Effect.map(PubSub.subscribe(p), Stream.fromQueue))` →
  `Stream.fromPubSub(p)` (v4 has a direct `Stream.fromPubSub`; the manual
  scoped-subscribe + `fromQueue` dance is no longer needed).
- `Cause.isInterruptedOnly` → `Cause.hasInterruptsOnly` (`terminal-view.tsx`,
  `terminal/terminal-core.tsx`).

## Verification

- `pnpm --filter code build:ondemand` — pass.
- `pnpm --filter code test` — pass (no test files in package; zero removed).
- `pnpm --filter code lint` — pass.
- No `@effect/rpc` / `@effect/platform` / `@effect/opentelemetry` imports remain.
