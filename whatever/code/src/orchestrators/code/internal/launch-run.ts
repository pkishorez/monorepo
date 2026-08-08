import type { UIMessage } from '@tanstack/ai';
import { Effect, Metric, Stream } from 'effect';
import type { RunConfigurationInput } from '../../../domain/run/index.js';
import type { Thread } from '../../../domain/thread/index.js';
import { Harness } from '../../../services/harness/index.js';
import { completeRun } from './complete-run.js';
import { persistenceFailures } from './metrics.js';
import type { RunEvent } from './run-events.js';

export const launchRun = (input: {
  thread: Thread;
  runId: string;
  configuration: RunConfigurationInput;
  message: UIMessage;
}) =>
  Effect.gen(function* () {
    const harness = yield* Harness;
    const { thread, runId, configuration, message } = input;

    const { chunks, outcome } = yield* harness.start({
      threadId: thread.threadId,
      runId,
      workingDirectory: thread.workingDirectory,
      sessionId: thread.harness.sessionId,
      configuration,
      message,
    });

    yield* Effect.forkDetach(
      outcome.pipe(
        Effect.flatMap((result) =>
          completeRun({ thread, runId, outcome: result }),
        ),
        Effect.catch((error) =>
          Metric.update(
            Metric.withAttributes(persistenceFailures, {
              harness: thread.harness._tag,
            }),
            1,
          ).pipe(
            Effect.andThen(
              Effect.logError('code.run.outcome_persistence_failed').pipe(
                Effect.annotateLogs({
                  'thread.id': thread.threadId,
                  'run.id': runId,
                  harness: thread.harness._tag,
                  'error.message':
                    error instanceof Error ? error.message : String(error),
                }),
              ),
            ),
          ),
        ),
      ),
    );

    return Stream.concat(
      Stream.succeed<RunEvent>({
        _tag: 'started',
        threadId: thread.threadId,
        runId,
      }),
      Stream.map(chunks, (chunk): RunEvent => ({ _tag: 'chunk', chunk })),
    );
  });
