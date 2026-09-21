# use-effect-ts

React hooks that run Effect programs inside a component's lifetime and cache Effect results with TanStack Query.

## Big picture

Running an Effect from a React component raises two questions: who owns the fiber, and what happens on unmount. Calling `Effect.runPromise` in an event handler leaves fibers running after the component is gone and lets a stale result update unmounted state. These hooks tie every run to a `Scope` the component owns, so unmount interrupts in-flight fibers and closes their resources.

The root export covers imperative runs: fire-and-forget, latest-wins, and one-at-a-time queues, plus a lifecycle hook for a long-lived Effect and a scope hook for custom runners. The `query` subpath wraps TanStack Query so a read-only Effect gets caching, background refresh, and cancellation without a second cache layer. TanStack is a dependency of this Package, and its client, provider, and hook are re-exported so the app has one import path.

The query design and its agreed trade-offs are in [docs/read-query-design.md](./docs/read-query-design.md). Version history is in [CHANGELOG.md](./CHANGELOG.md). `apps/alchemy-console` is the first consumer and shows every hook in a real app.

## Install

```sh
pnpm add use-effect-ts
```

Peer dependencies:

- `effect`: the hooks accept Effects and manage Effect fibers and scopes.
- `react`: the hooks are built on `useEffect`, `useRef`, `useCallback`, and `useState`.

## Exports

### `use-effect-ts`

| Export                  | What it does                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `useRunEffect`          | Returns a function that runs the given Effect factory as a fiber owned by the component; every fiber is interrupted on unmount. |
| `useRunEffectLatest`    | Like `useRunEffect`, but starting a new run interrupts the previous one.                                                        |
| `useRunEffectQueue`     | Like `useRunEffect`, but runs one call at a time in order; later calls wait in a queue.                                         |
| `useComponentLifecycle` | Forks a scoped Effect on mount and interrupts it and closes its scope on unmount or when `deps` change.                         |
| `useComponentScope`     | Creates a `Scope.Closeable` on mount, hands it to an optional setup callback, and closes it on unmount.                         |
| `useEventCallback`      | Returns a stable callback that always calls the latest version of the given function.                                           |

### `use-effect-ts/query`

| Export                | What it does                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `useEffectQuery`      | Runs an Effect through TanStack `useQuery` under an explicit key and returns the standard query result. |
| `effectQueryOptions`  | Builds the same query options for imperative use such as `client.fetchQuery` or `client.prefetchQuery`. |
| `QueryClient`         | TanStack's cache client, re-exported.                                                                   |
| `QueryClientProvider` | TanStack's context provider, re-exported.                                                               |
| `useQueryClient`      | TanStack's hook returning the nearest client, re-exported.                                              |

## Usage

### Own a connection for the life of a provider

Lifted from `apps/alchemy-console`. The RPC runtime is acquired when the provider mounts and disposed when it unmounts, and errors land in component state.

```tsx
import { Cause, Effect } from 'effect';
import { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { QueryClientProvider, QueryClient } from 'use-effect-ts/query';
import { makeRpcRuntime } from '../../connections/rpc/index.ts';

type Connection =
  | { status: 'connecting' }
  | { status: 'ready'; runtime: ReturnType<typeof makeRpcRuntime> }
  | { status: 'error'; message: string };

const RpcContext = createContext<Connection>({ status: 'connecting' });

export function RpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => () => queryClient.clear(), [queryClient]);
  const [connection, setConnection] = useState<Connection>({
    status: 'connecting',
  });

  useComponentLifecycle(
    Effect.gen(function* () {
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => makeRpcRuntime('/rpc')),
        (runtime) => runtime.disposeEffect,
      );
      yield* runtime.contextEffect;
      yield* Effect.sync(() => setConnection({ status: 'ready', runtime }));
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() =>
          setConnection({ status: 'error', message: Cause.pretty(cause) }),
        ),
      ),
    ),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RpcContext value={connection}>{children}</RpcContext>
    </QueryClientProvider>
  );
}
```

- `useComponentLifecycle` forks the Effect with a fresh `Scope` on mount.
- `Effect.acquireRelease` registers the release in that scope, so unmount disposes the runtime.
- The Effect must not require services; provide them before passing it in.
- Pass `{ deps }` to restart the Effect when an input changes.

### Run an action from a click and cache a read

Two hooks from the same app. `useRunEffect` runs a sign-in from a button and stops it on unmount. `useEffectQuery` caches a read keyed by its inputs.

```tsx
import { Effect } from 'effect';
import { useState } from 'react';
import { useRunEffect } from 'use-effect-ts';
import { useEffectQuery, useQueryClient } from 'use-effect-ts/query';
import type { QueryKey } from 'use-effect-ts/query';

function useAuthAction(
  signIn: () => Promise<{ error?: { message?: string } }>,
) {
  const [error, setError] = useState<string | null>(null);
  const run = useRunEffect(() =>
    Effect.tryPromise(signIn).pipe(
      Effect.match({
        onSuccess: (result) => {
          if (result.error) setError(result.error.message ?? 'Sign in failed.');
        },
        onFailure: () => setError('The sign-in service did not respond.'),
      }),
    ),
  );
  return { error, start: () => void run() };
}

function useRpcQuery<A, E>(query: Effect.Effect<A, E>, queryKey: QueryKey) {
  const client = useQueryClient();
  const result = useEffectQuery(queryKey, query, { staleTime: 30_000 });
  return {
    data: result.data ?? null,
    pending: result.isFetching,
    error: result.error,
    refresh: () => void client.invalidateQueries({ queryKey }),
  };
}
```

- `useRunEffect` returns a stable function; calling it forks a fiber in the component's `FiberSet` and resolves with an `Exit`.
- Unmount interrupts every fiber in the set, so late results never touch state.
- `useEffectQuery` passes `key` and `effect` to TanStack; the third argument passes through options like `staleTime`, `enabled`, and `select`.
- TanStack cancellation interrupts the Effect through the abort signal; failures reject with `Cause.squash`, so `error` is `unknown`.
- Put every input that changes the result in the key; Effect identity is not cache identity.
