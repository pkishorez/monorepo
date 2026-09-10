# use-effect-ts

React hooks for Effect.TS 🚀

## Cached queries

Import query APIs from `use-effect-ts/query`. TanStack Query is a dependency of
this package and supplies the cache, React subscriptions, and query options.

```tsx
import { Effect } from 'effect';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useEffectQuery,
} from 'use-effect-ts/query';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function Greeting({ name }: { name: string }) {
  const query = useEffectQuery(
    ['greeting', name],
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch(
          `/api/greeting?name=${encodeURIComponent(name)}`,
          {
            signal,
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      },
      catch: (error) => error,
    }),
    { staleTime: 30_000 },
  );

  if (query.isPending) return <p>Loading…</p>;
  if (query.isError && query.data === undefined) return <p>Could not load.</p>;
  return (
    <p>
      {query.data}
      {query.isFetching && ' (refreshing…)'}
      <button onClick={() => void query.refetch()}>Refresh</button>
    </p>
  );
}
```

Wrap consumers in `QueryClientProvider` with a stable client. The provider and
client are TanStack's own exports; an existing TanStack provider also works.
The application owns the client's lifetime and should clear or replace it when
switching sessions whose data must be isolated.

### API

- `useEffectQuery(key, effect, options?)` returns the standard TanStack query result.
- `effectQueryOptions(key, effect, options?)` builds the same query options for
  imperative operations such as `client.fetchQuery` or `client.prefetchQuery`.
- `QueryClient`, `QueryClientProvider`, and `useQueryClient` provide cache access.
- `QueryKey` is exported for annotating query keys; options are inferred.

The third argument passes TanStack options through, including `enabled`, `select`,
`staleTime`, `gcTime`, `retry`, and refetch settings. `queryKey` and `queryFn` are
reserved for the first two arguments. Include every input that changes the result
in the key; Effect object identity does not determine cache identity.

The Effect must have its services provided before being passed to the hook. Reuse
your application's runtime/context for those services; the hook does not create
or dispose a managed runtime. Use `Effect.scoped` for request-local scoped resources.
TanStack cancellation interrupts the Effect; promise-based transports must use
the signal supplied by Effect to abort their underlying I/O.

Failures reject with `Cause.squash`. The result's error type is `unknown` because
an execution can fail with a domain failure or an unexpected defect.

No library-specific cache defaults are imposed. With TanStack's client defaults,
data is immediately stale, stale queries refresh on mount/focus/reconnect, inactive
data is retained for five minutes, and failed requests retry three times.
Freshness expiry does not itself start a refresh timer. Configure defaults on the
client or override them per query.
