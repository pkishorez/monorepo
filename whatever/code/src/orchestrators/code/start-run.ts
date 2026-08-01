import type { UIMessage } from '@tanstack/ai';
import { Effect, Metric, Stream } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import {
  toPersistedConfiguration,
  type RunConfigurationInput,
} from '../../domain/run/index.js';
import { Db } from '../../services/db/index.js';
import { Harness } from '../../services/harness/index.js';
import { CodeError, launchRun, toCodeError } from './internal/index.js';
import { runStarted } from './internal/metrics.js';

export const startRun = (input: {
  threadId: string;
  configuration: RunConfigurationInput;
  message: UIMessage;
}) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { threadId, configuration, message } = input;
      const db = yield* Db;
      const harness = yield* Harness;

      const threadRow = yield* db.thread.get({ threadId });
      if (!threadRow) {
        return yield* Effect.fail(
          new CodeError('thread_not_found', `Thread not found: ${threadId}`),
        );
      }
      const thread = threadRow.value;
      if (thread.harness._tag !== configuration._tag) {
        return yield* Effect.fail(
          new CodeError(
            'harness_mismatch',
            `Thread is bound to ${thread.harness._tag}; got ${configuration._tag}`,
          ),
        );
      }
      if (yield* harness.isBusy(threadId)) {
        return yield* Effect.fail(
          new CodeError('thread_busy', 'Thread already has a running Run'),
        );
      }

      const runId = yield* nextUlid;
      yield* db.table.transact([
        yield* db.run.insertOp({
          runId,
          threadId,
          status: 'running',
          configuration: toPersistedConfiguration(configuration),
          terminalDetails: null,
        }),
        yield* db.message.insertOp({
          messageId: yield* nextUlid,
          threadId,
          runId,
          payload: message,
        }),
      ]);

      const identifiers = { 'thread.id': threadId, 'run.id': runId };
      yield* Effect.annotateCurrentSpan(identifiers);
      yield* Metric.update(
        Metric.withAttributes(runStarted, { harness: configuration._tag }),
        1,
      );
      yield* Effect.logInfo('code.run.started').pipe(
        Effect.annotateLogs({
          ...identifiers,
          harness: configuration._tag,
          model: configuration.model,
        }),
      );

      return yield* launchRun({ thread, runId, configuration, message });
    }).pipe(
      Effect.mapError(toCodeError),
      Effect.tapError((error) =>
        Effect.logWarning('code.run.rejected').pipe(
          Effect.annotateLogs({
            operation: 'start-run',
            'thread.id': input.threadId,
            'error.code': error.code,
            'error.message': error.message,
          }),
        ),
      ),
      Effect.withSpan('code.run.start', {
        attributes: {
          'thread.id': input.threadId,
          harness: input.configuration._tag,
          model: input.configuration.model,
        },
      }),
    ),
  );
