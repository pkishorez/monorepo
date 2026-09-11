import { Effect, Stream } from 'effect';
import { useEffect, useState } from 'react';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcAction } from '../queries/index.ts';
import {
  DeletionError,
  type analysisEvent,
  type credentialChoice,
  type deletionPlan,
} from '../../../../shared/contracts/deletion/index.ts';
import type { stageTarget } from '../../../../shared/contracts/targets/index.ts';

export type Analysis = {
  id: string;
  type: string;
  status: 'analyzing' | 'analyzed' | 'failed';
};

export type PreviewFailure = { id: string | null; message: string };

const applyAnalysis = (
  current: readonly Analysis[],
  event: typeof analysisEvent.Type,
): Analysis[] => {
  const status = event.kind === 'analyzing' ? 'analyzing' : 'analyzed';
  const index = current.findIndex((entry) => entry.id === event.id);
  if (index === -1)
    return [...current, { id: event.id, type: event.type, status }];
  return current.map((entry, i) =>
    i === index ? { ...entry, type: event.type, status } : entry,
  );
};

export function useDeletionPreview(input: typeof stageTarget.Type) {
  const [plan, setPlan] = useState<typeof deletionPlan.Type | null>(null);
  // A re-plan keeps the last plan on screen but it can't be confirmed until the new one lands.
  const [stale, setStale] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis[]>([]);
  const [failure, setFailure] = useState<PreviewFailure | null>(null);
  const action = useRpcAction(
    (credentials: readonly (typeof credentialChoice.Type)[] | undefined) =>
      Effect.gen(function* () {
        const rpc = yield* Rpc;
        let settled = false;
        yield* rpc['Deletion.Preview']({ ...input, credentials }).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event.kind === 'heartbeat') return;
              if (event.kind === 'analyzing' || event.kind === 'analyzed')
                setAnalysis((current) => applyAnalysis(current, event));
              if (event.kind === 'plan') {
                settled = true;
                setPlan(event.plan);
                setStale(false);
              }
              if (event.kind === 'failed') {
                settled = true;
                setAnalysis((current) =>
                  current.map((entry) =>
                    entry.id === event.id
                      ? { ...entry, status: 'failed' }
                      : entry,
                  ),
                );
                setFailure({ id: event.id, message: event.message });
              }
            }),
          ),
        );
        if (!settled)
          return yield* Effect.fail(
            new DeletionError({
              code: 'remote-error',
              reason:
                'The connection ended before the plan was ready. Retry to analyze the stage again.',
            }),
          );
      }),
    () => {},
  );
  const error =
    failure ?? (action.error ? { id: null, message: action.error } : null);
  const start = (credentials?: readonly (typeof credentialChoice.Type)[]) => {
    setStale(true);
    setAnalysis((current) =>
      current.map((entry) => ({ ...entry, status: 'analyzing' })),
    );
    setFailure(null);
    action.run(credentials);
  };
  useEffect(() => {
    start();
    // The first plan runs once on open; later re-plans come from credential changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    plan,
    stale,
    analysis,
    failure: error,
    pending: action.pending,
    /** Re-plans the stage with the user's credential picks; the first plan starts on mount. */
    start,
  };
}
