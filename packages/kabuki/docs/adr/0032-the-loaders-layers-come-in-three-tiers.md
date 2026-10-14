# The Loaders' Layers come in three tiers, a call each

What a Loader Requires is made at one of three times, from one of two things. The `instance` tier is made once, from the env, the first time a request loads, and kept for every request after: clients of bindings, config, caches. The `request` tier is made for each request that loads, from the env alone: what must not outlive a request, as a Postgres connection over Hyperdrive, which Cloudflare forbids sharing between requests. The `visitor` tier is made for each request that loads a dynamic or client place, from the env and the request itself: who is signed in. A static place's answer is kept in the Cache for everyone, so a static Loader may use the first two tiers and never the third: Requiring a visitor service is a type error, and on a page whose places are all static the visitor tier is never made. `Start.ResponseHeaders`, how a Loader adds a refreshed session's `set-cookie` to its response, belongs with the visitor tier for the same reason.

Each tier is a call of its own, `Start.layers<Env>().instance(…).request(…).visitor(…).loaders(loaders)`, each checked against the tiers before it, and the Loaders checked last against every tier they may use. A check over every tier in one call settles the tiers' types before the functions that make them are read, so a Layer written inline, or a tier written as `(env) => …`, is inferred as giving nothing; a call each infers each tier alone, then checks it against types already settled. `Routes.loaders` records, by type alone, which of its Loaders are static, so the check knows them.

## Considered Options

- **Two tiers, instance and request, the request tier given the request, static Loaders kept to the instance tier**: rejected. A static page backed by a per-request connection would have no tier to use.
- **Two tiers, both open to every Loader**: rejected. A static Loader could read the visitor and have its answer kept for everyone.
- **Every tier in one options object, `Start.loaders(loaders, { instance, request, visitor })`**: rejected. TypeScript settles the tiers' types before it reads their functions whenever the check names them, so it cannot be both inferred and checked in one call.
- **Every tier made once, per instance**: rejected. A connection made in one request fails when another uses it.

## Consequences

- The instance tier is made again if making it failed, and never torn down: a platform ends an instance without a word, so it holds nothing that must be closed.
- A tier may only use the tiers before it, in the order instance, request, visitor.
