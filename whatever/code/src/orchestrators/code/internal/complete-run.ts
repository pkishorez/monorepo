import { Duration, Effect, Metric } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import { deriveRunTerminal } from '../../../domain/run/index.js';
import type { Thread } from '../../../domain/thread/index.js';
import { Db } from '../../../services/db/index.js';
import { type HarnessRunOutcome } from '../../../services/harness/index.js';
import { runChunks, runDuration, runFinished } from './metrics.js';

export const completeRun = (input: {
  thread: Thread;
  runId: string;
  outcome: HarnessRunOutcome;
}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const { thread, runId, outcome } = input;
    const { threadId } = thread;
    const { status, terminalDetails } = deriveRunTerminal(outcome);

    const ops = [];
    for (const payload of outcome.messages) {
      ops.push(
        yield* db.message.insertOp({
          messageId: yield* nextUlid,
          threadId,
          runId,
          payload,
        }),
      );
    }
    ops.push(
      yield* db.run.getAndUpdateOp(
        { threadId, runId },
        { status, terminalDetails },
      ),
    );
    if (outcome.sessionId !== null && thread.harness.sessionId === null) {
      const sessionId = outcome.sessionId;
      ops.push(
        yield* db.thread.getAndUpdateOp({ threadId }, (current) => ({
          harness: { ...current.harness, sessionId },
        })),
      );
    }
    yield* db.table.transact(ops);

    const metricAttributes = {
      harness: thread.harness._tag,
      status,
    };
    yield* Metric.update(
      Metric.withAttributes(runFinished, metricAttributes),
      1,
    );
    yield* Metric.update(
      Metric.withAttributes(runDuration, metricAttributes),
      Duration.millis(outcome.durationMs),
    );
    yield* Metric.update(
      Metric.withAttributes(runChunks, { harness: thread.harness._tag }),
      outcome.chunkCount,
    );

    const terminal = terminalDetails!;
    const terminalAttributes =
      terminal._tag === 'Completed'
        ? terminal.finishReason === null
          ? {}
          : { 'run.finish_reason': terminal.finishReason }
        : {
            ...(terminal.code === null ? {} : { 'error.code': terminal.code }),
            'error.message': terminal.message,
          };
    const attributes = {
      'thread.id': threadId,
      'run.id': runId,
      harness: thread.harness._tag,
      status,
      'run.duration_ms': outcome.durationMs,
      'run.chunk_count': outcome.chunkCount,
      'run.message_count': outcome.messages.length,
      ...terminalAttributes,
    };
    yield* Effect.annotateCurrentSpan(attributes);
    yield* (
      status === 'failed'
        ? Effect.logError('code.run.failed')
        : Effect.logInfo('code.run.finished')
    ).pipe(Effect.annotateLogs(attributes));
  }).pipe(
    Effect.withSpan('code.run.complete', {
      attributes: {
        'thread.id': input.thread.threadId,
        'run.id': input.runId,
        harness: input.thread.harness._tag,
      },
    }),
  );
