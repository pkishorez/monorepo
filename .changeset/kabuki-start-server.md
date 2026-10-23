---
'@kestack/kabuki': patch
'@kestack/auth-toolkit': patch
---

Kabuki Start's two files each take one object. `src/app` default-exports `Start.app({ router, view, document, layer })`, and `src/loaders.server` default-exports `Start.server(loaders)` when its Loaders Require nothing, or `Start.server({ layer, visitor }).loaders(loaders)`: a Layer made once and one made for each visitor, in place of the three tiers of `Start.layers()`. The platform's env is a service, `Start.Env`, read with `Start.env<WorkerEnv>()`, and the request is `Start.Request`, for the visitor and the dynamic and client Loaders only. Start's handler is now `handler({ app, server, build })`.
