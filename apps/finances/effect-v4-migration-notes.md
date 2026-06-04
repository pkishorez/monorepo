# finances — Effect v4 migration notes

Migrated `apps/finances` from Effect v3 to v4 (`4.0.0-beta.78`). Minimal,
idiomatic changes only — no behavior change, no tests removed.

## Import remaps (folded packages)

- `@effect/rpc` → `effect/unstable/rpc` in `src/server/rpcs.ts`,
  `src/server.ts`, `src/routes/internal/effect.ts`. The `Rpc`, `RpcGroup`,
  `RpcServer`, `RpcClient`, `RpcSerialization` APIs and call shapes
  (`Rpc.make`, `RpcGroup.make`, `RpcServer.layer`,
  `RpcServer.layerProtocolSocketServer`, `RpcSerialization.layerNdjson`,
  `RpcClient.make`, `RpcClient.layerProtocolSocket`) are all unchanged.
- `@effect/platform-node` / `@effect/platform-browser` are **surviving**
  standalone v4 packages — imports left as-is. `NodeSocketServer.layerWebSocket`,
  `NodeRuntime.runMain`, `BrowserSocket.layerWebSocket` are unchanged.

## Service / Context changes

- `src/routes/internal/effect.ts`: `Effect.Service<Self>()(id, { scoped,
dependencies })` → `Context.Service<Self>()(id, { make })` with a hand-built
  `static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(...))`
  carrying the former `dependencies`. `FinancesClient.Default` →
  `FinancesClient.layer` (also updated the 6 consumer sites in
  `routes/internal/collections/{overrides,transactions,settings}.ts`).
- `src/services/db.ts`: `Context.Tag('finances/Db')<Db, DbShape>()` →
  `Context.Service<Db, DbShape>()('finances/Db')`;
  `Layer.scoped` → `Layer.effect`; `Context.unsafeGet` → `Context.getUnsafe`.

## Schema changes

- `src/domain/transaction.ts`, `src/domain/settings.ts`:
  `Schema.Literal('a', 'b')` → `Schema.Literals(['a', 'b'])`.
- `src/domain/settings.ts`: `Schema.Record({ key, value })` →
  `Schema.Record(key, value)` (positional).
- `src/server/rpcs.ts`: **`Schema.Union(a, b, c)` → `Schema.Union([a, b, c])`**
  — `Schema.Union` now takes a single array of members, not variadic args.

## Stream changes

- `src/server/handlers.ts`: `Stream.unfoldEffect(init, fn)` → `Stream.paginate(
init, fn)`. The page fn returns `Effect<[ReadonlyArray<A>, Option<S>]>`
  (emit-batch + next-state), not `Option<[A, S]>`. Each single-event step
  becomes `[[event], Option.some(nextState)]`; the stream never terminates here
  (always `Option.some`), matching the v3 infinite heartbeat loop.
- `src/server/__tests__/handlers.test.ts`: `Stream.runCollect` now returns
  `Effect<Array<A>>`; dropped the trailing `Effect.map(Chunk.toArray)` adapter
  in `takeEvents` (removed the `Chunk` import). No tests removed/skipped.

## RpcServer.layer residual `R` typing

- `RpcServer.layer(group)` types its layer requirement as `Protocol | ToHandler
| Middleware | ServicesServer`, and for these groups `Middleware`/
  `ServicesServer` resolve to **`any`** (reproduces for even a trivial
  single-rpc group). After providing all real deps the layer's `R` stays `any`,
  which `NodeRuntime.runMain` rejects (`any` not assignable to `never`).
  Resolved with a single narrowing cast at the provide site:
  `Effect.provide(RpcLive)) as Effect.Effect<void>`. No runtime change — the
  layer is fully provided; this only papers over the upstream `any` widening.
