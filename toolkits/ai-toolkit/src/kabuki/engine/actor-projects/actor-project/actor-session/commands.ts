import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Desks } from '../../../capabilities/index.js';

/**
 * Tells the agent to stop one of its Background Jobs. A stop the harness
 * refuses comes back as JobStopFailed, so the Session can say why; one that
 * works shows in the Jobs the agent reports next. An agent not open has no
 * jobs to stop.
 */
export const StopJob = Command.make('StopJob', {
  args: Schema.Struct({ sessionId: Schema.String, jobId: Schema.String }),
  run: ({ sessionId, jobId }) =>
    Effect.gen(function* () {
      const desk = yield* (yield* Desks).of(sessionId);
      const agent = yield* desk.opened;
      if (!agent) return;
      return yield* agent.stopBackgroundJob(jobId).pipe(
        Effect.as(undefined),
        Effect.catch((error) =>
          Effect.succeed({
            _tag: 'JobStopFailed' as const,
            jobId,
            reason: error.message,
          }),
        ),
      );
    }),
});
