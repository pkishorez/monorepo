import { Effect } from 'effect';
import { useCallback, useState } from 'react';
import type { StudioRpcClient } from 'std-toolkit/studio-rpc';
import type { TableSnapshot } from 'std-toolkit/snapshot';
import { useComponentLifecycle } from 'use-effect-ts';

type SnapshotState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | {
      readonly kind: 'success';
      readonly snapshot: TableSnapshot;
      readonly refreshing: boolean;
    };

const failureMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'The table snapshot could not be loaded.';
};

export function useSnapshotSession(rpcClient: StudioRpcClient<unknown>) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<SnapshotState>({ kind: 'loading' });

  useComponentLifecycle(
    rpcClient['Studio.GetTableSnapshot']().pipe(
      Effect.match({
        onFailure: (error) =>
          setState({ kind: 'failure', message: failureMessage(error) }),
        onSuccess: (snapshot) =>
          setState({ kind: 'success', snapshot, refreshing: false }),
      }),
    ),
    { deps: [rpcClient, reload] },
  );

  const refresh = useCallback(() => {
    setState((current) =>
      current.kind === 'success'
        ? { ...current, refreshing: true }
        : { kind: 'loading' },
    );
    setReload((value) => value + 1);
  }, []);

  return { state, refresh } as const;
}
