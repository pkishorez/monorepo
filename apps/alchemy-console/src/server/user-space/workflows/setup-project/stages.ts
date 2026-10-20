import { Effect } from 'effect';
import {
  isFinished,
  type Run,
} from '../../../../shared/contracts/run/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { RunLifecycle } from '../run-lifecycle/index.ts';

/*
 * A stage follows the runs that work on it: a Deploy that succeeds makes it
 * live, with the commit it deployed and the stack's outputs; one that ends
 * any other way leaves it failed, or live as it was, when it was cancelled
 * after an earlier deploy. Only the stage's own latest run counts, so an
 * older one ending late changes nothing.
 */

/** Settles the stage `run` worked on, if `run` is its latest. Safe to call again. */
export const settleStage = (run: Run) =>
  Effect.gen(function* () {
    if (run.projectId === null || run.kind !== 'deploy') return;
    if (!isFinished(run.status)) return;
    const storage = yield* Storage;
    const stage = yield* storage.stages.get(run.projectId, run.stage);
    if (stage === null || stage.lastRunId !== run.runId) return;
    if (stage.status !== 'deploying') return;
    if (run.result?._tag === 'Deployed') {
      yield* storage.stages.markDeployed({
        projectId: run.projectId,
        stage: run.stage,
        commit: run.commit,
        outputs: run.result.outputs,
      });
      return;
    }
    yield* storage.stages.markStatus(
      run.projectId,
      run.stage,
      run.status === 'cancelled' && stage.lastDeployedCommit !== null
        ? 'live'
        : 'deploy-failed',
    );
  });

/** Has every run that ends settle its stage: once, as the User Space starts. */
export const followRuns = Effect.gen(function* () {
  const lifecycle = yield* RunLifecycle;
  const context = yield* Effect.context<Storage>();
  yield* lifecycle.onFinished((run) =>
    settleStage(run).pipe(Effect.provideContext(context)),
  );
});
