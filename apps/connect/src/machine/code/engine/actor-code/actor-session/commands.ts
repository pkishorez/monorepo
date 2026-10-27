import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { QuestionAnswerSchema } from '@kestack/ai-toolkit/contract';
import { Agents } from '../../capabilities/index.js';

/** Why an answer to an Agent Question that is gone was not given. */
export const NOT_ASKED = 'This question is no longer asked';

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
      const kept = yield* (yield* Agents).of(sessionId);
      const agent = yield* kept.opened;
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

/**
 * Gives the agent the user's answer to one of its Agent Questions, or
 * declines it with null. It ends with AnswerGiven either way: no reason
 * when the agent took it, the harness's reason when it refused, as for a
 * question no longer asked. A closed agent asks nothing.
 */
export const AnswerQuestion = Command.make('AnswerQuestion', {
  args: Schema.Struct({
    sessionId: Schema.String,
    answerId: Schema.String,
    questionId: Schema.String,
    answer: Schema.NullOr(QuestionAnswerSchema),
  }),
  run: ({ sessionId, answerId, questionId, answer }) =>
    Effect.gen(function* () {
      const kept = yield* (yield* Agents).of(sessionId);
      const agent = yield* kept.opened;
      const given = (reason: string | null) => ({
        _tag: 'AnswerGiven' as const,
        answerId,
        reason,
      });
      if (!agent) return given(NOT_ASKED);
      return yield* agent.answer(questionId, answer).pipe(
        Effect.as(given(null)),
        Effect.catch((error) => Effect.succeed(given(error.message))),
      );
    }),
});
