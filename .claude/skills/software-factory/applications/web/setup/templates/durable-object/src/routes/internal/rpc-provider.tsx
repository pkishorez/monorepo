import { Cause, Effect } from 'effect';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { makeRpcRuntime } from '../../client/rpc/index.ts';

type Connection =
  | { status: 'connecting' }
  | { status: 'ready'; runtime: ReturnType<typeof makeRpcRuntime> }
  | { status: 'error'; message: string };

const RpcContext = createContext<Connection>({ status: 'connecting' });

export function RpcProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection>({
    status: 'connecting',
  });

  useComponentLifecycle(
    Effect.gen(function* () {
      yield* Effect.sync(() => setConnection({ status: 'connecting' }));
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => makeRpcRuntime(import.meta.env.VITE_RPC_URL)),
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

  return <RpcContext value={connection}>{children}</RpcContext>;
}

export const useRpc = () => useContext(RpcContext);
