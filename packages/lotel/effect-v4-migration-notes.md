# lotel — Effect v4 migration notes

Migrated `lotel` (local OpenTelemetry dev server) from Effect v3 to
`4.0.0-beta.78`. Public exports (`.`, `./domain`, `./client`) and CLI behavior
are unchanged. Zero tests removed or skipped (4 pass).

## Folded packages

- `@effect/cli` → `effect/unstable/cli`.
- `@effect/platform` (HttpApi + http) → `effect/unstable/httpapi` +
  `effect/unstable/http`. `@effect/platform-node` stays standalone.

## CLI (`src/cli/index.ts`)

- `Options` → `Flag` (`Options.text` → `Flag.string`, `Options.integer` →
  `Flag.integer`, `Options.optional` → `Flag.optional`).
- `Command.run(cmd, { name, version })` → `Command.run(cmd, { version })`; the
  result is now an `Effect` reading argv from `Stdio`, so `cli(process.argv)` →
  `cli`.
- `NodeContext.layer` → `NodeServices.layer` (provides `Command.Environment`).
- **`HttpApiBuilder.serve` is gone.** Serving an HttpApi now goes through the
  HTTP router: `HttpRouter.serve(appLayer, { middleware })` where `appLayer` is
  the `HttpApiBuilder.layer(api)` (registers routes into the router). The result
  needs `HttpServer.HttpServer`, provided by `NodeHttpServer.layer(createServer,
{ host, port })`. The old `HttpApiBuilder.serve((app) =>
HttpMiddleware.logger(HttpMiddleware.cors()(app)))` becomes the `middleware`
  option of `HttpRouter.serve`. `HttpMiddleware` now lives at
  `effect/unstable/http`.

## HttpApi (`src/http-api/api.ts`, `errors.ts`, `src/server/*`)

- `HttpApiBuilder.api(api)` → `HttpApiBuilder.layer(api)`.
- `HttpApiBuilder.group(api, name, build)` unchanged in shape (still returns a
  group layer; `handlers.handle(...)` unchanged).
- **`HttpApiEndpoint` builder is now options-object form, not fluent.**
  `HttpApiEndpoint.post(name, path).setPayload(p).addSuccess(s).addError(e)` →
  `HttpApiEndpoint.post(name, path, { payload, success, error })`. Multiple
  errors go in an `error: [E1, E2, E3]` array. `setUrlParams(s)` → `query: s`.
- **`HttpApiEndpoint.del` is exported as `delete`** — call
  `HttpApiEndpoint.delete(...)`.
- **Handler context: `urlParams` → `query`.** `({ urlParams: { cursor } })` →
  `({ query: { cursor } })`.
- **`HttpApiSchema.annotations({ status: n })` is gone.** v4 has
  `HttpApiSchema.status(code)` (a pipeable that just does
  `.annotate({ httpApiStatus: code })`). For a `Schema.TaggedErrorClass` 3rd-arg
  annotations object, pass `{ httpApiStatus: 400 }` directly.
- `Schema.TaggedError<Self>()(...)` → `Schema.TaggedErrorClass<Self>()(...)`.

## Storage (`src/storage/db.ts`)

- `Context.Tag('lotel/Db')<Db, DbShape>()` →
  `Context.Service<Db, DbShape>()('lotel/Db')`.
- `Layer.scoped(tag, scopedEffect)` → `Layer.effect(tag, scopedEffect)`
  (`Layer.effect` now `Exclude`s `Scope` from `R`, so scoped acquire/release
  effects work directly; `Layer.scoped` no longer exists).
- `Context.unsafeGet(ctx, tag)` → `Context.getUnsafe(ctx, tag)`.

## No public API change

CLI flags (`--host`, `--port`, `--db`), env fallbacks, and routes are
identical. `LotelApi`, `LotelGroup`, and the three error classes are still
exported with the same shapes.
