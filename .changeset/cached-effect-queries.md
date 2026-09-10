---
'use-effect-ts': patch
---

Add the `use-effect-ts/query` subpath with `useEffectQuery(key, effect, options)` for cached Effect-backed reads using TanStack Query. Pass query options through, propagate cancellation to Effect execution, and expose `effectQueryOptions`, `QueryClient`, `QueryClientProvider`, and `useQueryClient` for shared cache management.
