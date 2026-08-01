import { Effect, Metric } from 'effect';
import { Db } from '../../services/db/index.js';
import { Harness } from '../../services/harness/index.js';
import { CodeError, toCodeError } from './internal/index.js';
import { runInterrupts } from './internal/metrics.js';

export const interruptRun = (input: { threadId: string; runId: string }) =>
  Effect.gen(function* () {
    const { threadId, runId } = input;
    const harness = yield* Harness;

    if (yield* harness.interrupt({ threadId, runId })) {
      yield* Metric.update(
        Metric.withAttributes(runInterrupts, { result: 'accepted' }),
        1,
      );
      yield* Effect.logInfo('code.run.interrupt.requested').pipe(
        Effect.annotateLogs({
          'thread.id': threadId,
          'run.id': runId,
          result: 'accepted',
        }),
      );
      return { runId, status: 'interrupted' as const };
    }

    const db = yield* Db;
    const runRow = yield* db.run.get({ threadId, runId });
    if (!runRow) {
      return yield* Effect.fail(
        new CodeError('run_not_found', `Run not found: ${runId}`),
      );
    }
    if (runRow.value.status === 'interrupted') {
      yield* Metric.update(
        Metric.withAttributes(runInterrupts, {
          result: 'already-interrupted',
        }),
        1,
      );
      yield* Effect.logInfo('code.run.interrupt.requested').pipe(
        Effect.annotateLogs({
          'thread.id': threadId,
          'run.id': runId,
          result: 'already-interrupted',
        }),
      );
      return { runId, status: 'interrupted' as const };
    }
    return yield* Effect.fail(
      new CodeError(
        'run_not_running',
        `Run is not running (status: ${runRow.value.status})`,
      ),
    );
  }).pipe(
    Effect.mapError(toCodeError),
    Effect.tapError((error) =>
      Effect.logWarning('code.run.rejected').pipe(
        Effect.annotateLogs({
          operation: 'interrupt-run',
          'thread.id': input.threadId,
          'run.id': input.runId,
          'error.code': error.code,
          'error.message': error.message,
        }),
      ),
    ),
    Effect.withSpan('code.run.interrupt', {
      attributes: {
        'thread.id': input.threadId,
        'run.id': input.runId,
      },
    }),
  );
