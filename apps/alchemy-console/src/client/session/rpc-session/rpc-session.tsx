import { Cause, Effect, Exit } from 'effect';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle, useRunEffect } from 'use-effect-ts';
import { makeRpcRuntime, Rpc } from '../../connections/rpc/index.ts';
import { authClient } from '../../connections/auth/index.ts';

import {
  QueryClientProvider,
  useEffectQuery,
  useQueryClient,
} from 'use-effect-ts/query';
import type { QueryKey } from 'use-effect-ts/query';
import { makeQueryClient } from './query-cache.ts';

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
    return 'The request failed before it reached the server. Retry.';
  if ('_tag' in error && error._tag === 'Unauthenticated')
    return 'Your session expired. Sign in again to continue.';
  return 'The request didn’t complete. Retry.';
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
  options: {
    enabled?: boolean;
    errorMessage?: (error: unknown) => string;
  } = {},
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
  const result = useEffectQuery(queryKey, effect, {
    enabled: connection.status === 'ready' && options.enabled !== false,
  });

  return {
    data: result.data ?? null,
    pending: result.isFetching,
    error: result.error
      ? (options.errorMessage ?? message)(result.error)
      : null,
    refresh: () => {
      void client.invalidateQueries({ queryKey });
    },
  };
}

export function useRpcAction<Input, A, E>(
  action: (input: Input) => Effect.Effect<A, E, Rpc>,
  onSuccess: (value: A) => void,
  options: { errorMessage?: (error: unknown) => string } = {},
) {
  const connection = useRpc();
  const session = authClient.useSession();
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
      yield* Effect.sync(() => {
        if (Exit.isSuccess(exit)) onSuccess(exit.value);
        else
          setError((options.errorMessage ?? message)(Cause.squash(exit.cause)));
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
