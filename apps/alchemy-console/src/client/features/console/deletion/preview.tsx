import { Effect, Stream } from 'effect';
import { useState } from 'react';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcAction } from '../queries/index.ts';
import {
  DeletionError,
  type credentialChoice,
  type deletionPlan,
} from '../../../../shared/contracts/deletion/index.ts';
import type { stageTarget } from '../../../../shared/contracts/targets/index.ts';
import {
  AnalysisView,
  applyAnalysis,
  markFailed,
  resetAnalysis,
  type Analysis,
  type PreviewFailure,
} from './analysis-view.tsx';

export function useDeletionPreview(input: typeof stageTarget.Type) {
  const [plan, setPlan] = useState<typeof deletionPlan.Type | null>(null);
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
              }
              if (event.kind === 'failed') {
                settled = true;
                setAnalysis((current) => markFailed(current, event.id));
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
  return {
    plan,
    analysis,
    failure: error,
    pending: action.pending,
    failed: !plan && error !== null,
    /** Plans the stage; pass the user's credential picks to re-plan with them. */
    start: (credentials?: readonly (typeof credentialChoice.Type)[]) => {
      setPlan(null);
      setAnalysis(resetAnalysis);
      setFailure(null);
      action.run(credentials);
    },
  };
}

export function DeletionPreview({
  preview,
}: {
  preview: ReturnType<typeof useDeletionPreview>;
}) {
  return (
    <AnalysisView
      entries={preview.analysis}
      failure={preview.failure}
      pending={preview.pending}
    />
  );
}
