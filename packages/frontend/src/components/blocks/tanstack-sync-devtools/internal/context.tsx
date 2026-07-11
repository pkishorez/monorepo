import { createContext, useContext, type ReactNode } from 'react';
import type { Effect } from 'effect';
import type { SyncInspector } from 'std-toolkit/tanstack-sync';

export type RunSyncInspectorEffect = <A, E>(
  effect: Effect.Effect<A, E, never>,
) => Promise<A>;

type TanStackSyncDevtoolsContextValue = {
  inspector: SyncInspector;
  runPromise: RunSyncInspectorEffect;
};

const TanStackSyncDevtoolsContext =
  createContext<TanStackSyncDevtoolsContextValue | null>(null);

export function TanStackSyncDevtoolsProvider({
  inspector,
  runPromise,
  children,
}: TanStackSyncDevtoolsContextValue & { children: ReactNode }) {
  return (
    <TanStackSyncDevtoolsContext value={{ inspector, runPromise }}>
      {children}
    </TanStackSyncDevtoolsContext>
  );
}

export function useTanStackSyncDevtools() {
  const value = useContext(TanStackSyncDevtoolsContext);
  if (value == null) {
    throw new Error(
      'TanStack Sync devtools must be rendered inside its provider',
    );
  }
  return value;
}
