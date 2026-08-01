import type { UIMessage } from '@tanstack/ai';
import { Effect, Metric, Stream } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import {
  toPersistedConfiguration,
  type RunConfigurationInput,
} from '../../domain/run/index.js';
import { Db } from '../../services/db/index.js';
import { Git } from '../../services/git/index.js';
import { ensureMachineId, launchRun, toCodeError } from './internal/index.js';
import { runStarted, threadStarted } from './internal/metrics.js';

export const startThread = (input: {
  workingDirectory: string;
  configuration: RunConfigurationInput;
  message: UIMessage;
}) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { workingDirectory, configuration, message } = input;
      const db = yield* Db;
      const git = yield* Git;

      const gitContext = yield* git.contextOf(workingDirectory);
      const machineId = yield* ensureMachineId;

      const threadId = yield* nextUlid;
      const runId = yield* nextUlid;
      const thread = {
        threadId,
        machineId,
        workingDirectory,
        gitContext,
        harness: { _tag: configuration._tag, sessionId: null },
      };

      yield* db.table.transact([
        yield* db.thread.insertOp(thread),
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
        Metric.withAttributes(threadStarted, { harness: configuration._tag }),
        1,
      );
      yield* Metric.update(
        Metric.withAttributes(runStarted, { harness: configuration._tag }),
        1,
      );
      yield* Effect.logInfo('code.thread.started').pipe(
        Effect.annotateLogs({
          ...identifiers,
          harness: configuration._tag,
          model: configuration.model,
        }),
      );
      yield* Effect.logInfo('code.run.started').pipe(
        Effect.annotateLogs({
          ...identifiers,
          harness: configuration._tag,
          model: configuration.model,
          source: 'new-thread',
        }),
      );

      return yield* launchRun({ thread, runId, configuration, message });
    }).pipe(
      Effect.mapError(toCodeError),
      Effect.tapError((error) =>
        Effect.logWarning('code.run.rejected').pipe(
          Effect.annotateLogs({
            operation: 'start-thread',
            'error.code': error.code,
            'error.message': error.message,
          }),
        ),
      ),
      Effect.withSpan('code.thread.start', {
        attributes: {
          harness: input.configuration._tag,
          model: input.configuration.model,
        },
      }),
    ),
  );
