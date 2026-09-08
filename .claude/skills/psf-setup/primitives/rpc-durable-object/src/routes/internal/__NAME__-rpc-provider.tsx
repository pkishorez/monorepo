import { Cause, Effect } from 'effect';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { make__Name__RpcRuntime } from '../../client/rpc/__NAME__/index.ts';

type Connection =
  | { status: 'connecting' }
  | { status: 'ready'; runtime: ReturnType<typeof make__Name__RpcRuntime> }
  | { status: 'error'; message: string };

const __Name__RpcContext = createContext<Connection>({ status: 'connecting' });

export function __Name__RpcProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection>({
    status: 'connecting',
  });

  useComponentLifecycle(
    Effect.gen(function* () {
      yield* Effect.sync(() => setConnection({ status: 'connecting' }));
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() =>
          make__Name__RpcRuntime(
            new URL('/ws/__NAME__', window.location.origin).href,
          ),
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

  return <__Name__RpcContext value={connection}>{children}</__Name__RpcContext>;
}

export const use__Name__Rpc = () => useContext(__Name__RpcContext);
