import { Cause, Effect, Exit } from 'effect';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle, useRunEffect } from 'use-effect-ts';
import { makeRpcRuntime, Rpc } from '../../connections/rpc/index.ts';
import { authClient } from '../../connections/auth/index.ts';

import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import {
  effectQueryOptions,
  makeQueryClient,
  rpcQueryKeys,
} from './query-cache.ts';

type Connection =
  | { status: 'connecting' }
  | { status: 'ready'; runtime: ReturnType<typeof makeRpcRuntime> }
  | { status: 'error'; message: string };

const RpcContext = createContext<Connection>({ status: 'connecting' });

export function RpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  useEffect(() => () => queryClient.clear(), [queryClient]);
  const [connection, setConnection] = useState<Connection>({
    status: 'connecting',
  });

  useComponentLifecycle(
    Effect.gen(function* () {
      yield* Effect.sync(() => setConnection({ status: 'connecting' }));
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() =>
          makeRpcRuntime(new URL('/rpc', window.location.origin).href),
        ),
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

export const useRpc = () => useContext(RpcContext);

function message(error: unknown): string {
  if (typeof error !== 'object' || error === null)
    return 'Something went wrong. Please try again.';
  if ('_tag' in error && error._tag === 'Unauthenticated')
    return 'Your session expired. Please sign in again.';
  if (
    '_tag' in error &&
    (error._tag === 'StateStoreError' || error._tag === 'StoreDetailsError') &&
    'reason' in error &&
    typeof error.reason === 'string' &&
    error.reason.trim()
  )
    return error.reason;
  if ('code' in error) {
    switch (error.code) {
      case 'cloudflare-permission':
        return 'The Cloudflare token needs access to Workers and Secrets Store.';
      case 'state-store-missing':
        return 'No Alchemy state store was found. Deploy it in this Cloudflare account first.';
      case 'discovery-failed':
        return 'Could not discover the state store. Check the account ID and API token, then retry.';
      case 'not-found':
        return 'This store is no longer available.';
      case 'remote-error':
        return 'Could not read this store. Check its URL and token, then try again.';
      case 'invalid-state':
        return 'This store returned state we could not read.';
      case 'unsupported-endpoint':
        return 'Use the Cloudflare Worker’s HTTPS workers.dev URL for this store.';
      case 'timeout':
        return 'The store took too long to respond. Please try again.';
    }
  }
  return 'Could not complete the request. Please try again.';
}

const refreshExpiredSession =
  (refetch: () => Promise<unknown>) => (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'Unauthenticated'
      ? Effect.promise(refetch).pipe(Effect.ignore)
      : Effect.void;

export function useRpcQuery<A, E>(
  query: Effect.Effect<A, E, Rpc>,
  queryKey: QueryKey,
  options: { enabled?: boolean } = {},
) {
  const connection = useRpc();
  const session = authClient.useSession();
  const client = useQueryClient();
  const effect =
    connection.status === 'ready'
      ? Effect.flatMap(connection.runtime.contextEffect, (context) =>
          query.pipe(
            Effect.provide(context),
            Effect.tapError(refreshExpiredSession(session.refetch)),
          ),
        )
      : Effect.die('RPC is not connected');
  const result = useQuery({
    ...effectQueryOptions(queryKey, effect),
    enabled: connection.status === 'ready' && options.enabled !== false,
  });

  return {
    data: result.data ?? null,
    pending: result.isFetching,
    error: result.error ? message(result.error) : null,
    refresh: () => {
      void client.invalidateQueries({ queryKey });
    },
  };
}

export function useCachedStoreName(storeId: string) {
  const client = useQueryClient();
  const stores = client.getQueryData<readonly { id: string; name: string }[]>(
    rpcQueryKeys.stores,
  );
  return (
    stores?.find((store) => store.id === storeId)?.name ??
    client
      .getQueriesData<{ storeName: string }>({ queryKey: ['stores', storeId] })
      .find(([, data]) => data?.storeName)?.[1]?.storeName ??
    null
  );
}

export function useRpcAction<Input, A, E>(
  action: (input: Input) => Effect.Effect<A, E, Rpc>,
  onSuccess: (value: A) => void,
) {
  const connection = useRpc();
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const active = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRunEffect((input: Input) =>
    Effect.gen(function* () {
      if (connection.status !== 'ready') return;
      const context = yield* connection.runtime.contextEffect;
      const exit = yield* action(input).pipe(
        Effect.withSpan('UI.action'),
        Effect.provide(context),
        Effect.tapError(refreshExpiredSession(session.refetch)),
        Effect.exit,
      );
      if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) return;
      if (Exit.isSuccess(exit)) {
        yield* Effect.promise(() =>
          queryClient.invalidateQueries({
            queryKey: rpcQueryKeys.stores,
            refetchType: 'none',
          }),
        );
        yield* Effect.promise(() =>
          queryClient.refetchQueries({
            queryKey: rpcQueryKeys.stores,
            exact: true,
            type: 'active',
          }),
        );
      }
      yield* Effect.sync(() => {
        if (Exit.isSuccess(exit)) onSuccess(exit.value);
        else setError(message(Cause.squash(exit.cause)));
      });
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          active.current = false;
          setPending(false);
        }),
      ),
    ),
  );

  return {
    pending,
    error,
    run: (input: Input) => {
      if (active.current || connection.status !== 'ready') return;
      active.current = true;
      setPending(true);
      setError(null);
      void run(input);
    },
  };
}
