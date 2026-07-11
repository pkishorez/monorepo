import type { SyncInspector } from 'std-toolkit/tanstack-sync';
import { DevtoolsOverlay } from './devtools-overlay';
import {
  TanStackSyncDevtoolsProvider,
  type RunSyncInspectorEffect,
} from './internal/context';

export type TanStackSyncDevtoolsProps = {
  inspector: SyncInspector;
  runPromise: RunSyncInspectorEffect;
};

/** Browser overlay for inspecting collections created by TanStack Sync. */
export function TanStackSyncDevtools({
  inspector,
  runPromise,
}: TanStackSyncDevtoolsProps) {
  return (
    <TanStackSyncDevtoolsProvider inspector={inspector} runPromise={runPromise}>
      <DevtoolsOverlay />
    </TanStackSyncDevtoolsProvider>
  );
}
