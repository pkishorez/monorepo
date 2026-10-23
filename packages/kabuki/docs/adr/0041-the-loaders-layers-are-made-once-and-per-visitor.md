# The Loaders' Layers are made once and per visitor, and the app is one object

Supersedes [ADR 0032](0032-the-loaders-layers-come-in-three-tiers.md).

What a Loader Requires on the server is two plain Layers: `layer`, made once, the first time a request loads, and kept for every request after; and `visitor`, made for each request that loads a dynamic or client place. Neither is a function of the env: the env is a service, `Start.Env`, read typed with `Start.env<WorkerEnv>()`, which the layer gets from the first request that loads and the visitor from its own. The visitor may also read `Start.Request`, `Start.ResponseHeaders` and what the layer gives. A static place's answer is kept for everyone, so a static Loader may use only the layer: Requiring a visitor service is a type error, and on a page whose places are all static the visitor is never made.

`src/loaders.server` default-exports `Start.server(loaders)` when no Loader Requires anything, a type error otherwise, and `Start.server({ layer, visitor }).loaders(loaders)` when one does. The Layers are one object; the Loaders are a call of their own, where every check is made: each Loader against the Layers it may use, and the visitor against the layer. `src/app` default-exports `Start.app({ router, view, document, layer })`, one object too.

## Considered Options

- **Three tiers, a call each, `Start.layers<Env>().instance(…).request(…).visitor(…).loaders(…)` (until now)**: rejected. Three words to learn for one rule, that a static Loader never reads the request, and each tier a function of the env, set apart from how every other service is provided.
- **Every Layer and the Loaders in one object, `Start.server({ loaders, layer, visitor })`**: rejected. TypeScript 7 settles a Layer written in place with Effect's dual functions, as `Layer.succeed(…)` or `Layer.merge(…)`, as giving nothing whenever another property of the same call is checked against it; a check on a Layer's own property alone keeps it typed as written. With the Loaders a call of their own, both Layers are settled before anything is checked against them.
- **The Loaders first and the Layers after, `Start.server(loaders).layers({ layer, visitor })`**: rejected, for the same reason: the visitor is checked against the layer in the same call. One call per Layer, `.layer(…).visitor(…)`, types, but then `Start.server(loaders)` with a Layer forgotten would compile, since nothing checks the file's default export; it would fail only when a Loader ran.
- **One Layer, the request's services told apart by Requiring `Start.Request`**: rejected. Start could not make part of a merged Layer once and the rest per request.

## Consequences

- There is no tier made for each request from the env alone. A static page backed by a connection that must not outlive a request, as Postgres over Hyperdrive, has no Layer to use; a dynamic or client one makes it in the visitor.
- The layer is made again if making it failed, and never torn down: a platform ends an instance without a word, so it holds nothing that must be closed.
- `server`, the function that makes Start's handler, is `handler`, so `Start.server` is the one thing called server.
