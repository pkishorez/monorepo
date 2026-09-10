# Read query primitive

Status: implemented following approval of the explicit-key API and query subpath.

## Agreed scope

- Provide a small, reusable primitive for read-only Effect-backed API queries in `use-effect-ts`.
- Use Alchemy Console as the first consumer; the primitive must not depend on Console-specific services or request types.
- Support returning cached data immediately while refreshing in the background.
- Pass query options through to TanStack Query and inherit its defaults.

## Implementation decisions

- TanStack Query is a dependency of `use-effect-ts`.
- Export query APIs only through `use-effect-ts/query`.
- Implement the query capability as a deep module: `index.ts` exposes
  `query.ts`, which delegates Effect execution to private `execution.ts`.
- Callers provide an explicit key and Effect to `useEffectQuery(key, effect, options?)`.
- Export TanStack's `QueryClientProvider`, `QueryClient`, and `useQueryClient`.
- Applications own cache lifetime and provide the Effect's dependencies.
- Return the standard TanStack result; forward cancellation into Effect execution.
- Keep errors typed as `unknown` because squashed causes can include defects.
- Build with the existing TypeScript compiler; no bundler is introduced.

## Current starting point

Alchemy Console already uses TanStack Query with an Effect adapter in
`apps/alchemy-console/src/client/session/rpc-session/query-cache.ts` and
`rpc-session.tsx`. Its current policy is immediate staleness, 30-minute inactive
retention, and no automatic retries. These are existing application choices,
not library defaults. Console now consumes the shared query primitive while
retaining those application choices.
