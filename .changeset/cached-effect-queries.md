---
'use-effect-ts': patch
---

Add the `use-effect-ts/query` subpath with `useEffectQuery(key, effect, options)` for cached Effect-backed reads using TanStack Query. Pass query options through, propagate cancellation to Effect execution, and expose `effectQueryOptions`, `QueryClient`, `QueryClientProvider`, and `useQueryClient` for shared cache management.

Breaking: peer requirements change from `effect@4.0.0-beta.102` and `react@19.2.7` to `effect@4.0.0-rc.112` and `react@19.2.8`.
