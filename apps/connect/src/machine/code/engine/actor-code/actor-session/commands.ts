import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { QuestionAnswerSchema } from '@kestack/ai-toolkit/contract';
import {
  Agents,
  Answers,
  type AnswerOutcome,
} from '../../capabilities/index.js';

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
 * declines it with null, and tells the caller waiting on `answerId` how it
 * went: taken, refused with the harness's reason, or not asked when the
 * agent is closed. It ends with no Message: the outcome is the caller's,
 * not the Session's. Interrupted, as when the Session stops, it tells the
 * caller the question is no longer asked.
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
      const answers = yield* Answers;
      const kept = yield* (yield* Agents).of(sessionId);
      const agent = yield* kept.opened;
      const outcome: AnswerOutcome = !agent
        ? { _tag: 'NotAsked' }
        : yield* agent.answer(questionId, answer).pipe(
            Effect.as<AnswerOutcome>({ _tag: 'Taken' }),
            Effect.catch((error) =>
              Effect.succeed<AnswerOutcome>({
                _tag: 'Refused',
                reason: error.message,
              }),
            ),
          );
      yield* answers.settle(answerId, outcome);
    }).pipe(
      Effect.onInterrupt(() =>
        Effect.flatMap(Answers, (answers) =>
          answers.settle(answerId, { _tag: 'NotAsked' }),
        ),
      ),
    ),
});

/**
 * Tells the caller waiting on `answerId` that its question is no longer
 * asked, so nothing was given to the agent.
 */
export const AnswerNotAsked = Command.make('AnswerNotAsked', {
  args: Schema.Struct({ answerId: Schema.String }),
  run: ({ answerId }) =>
    Effect.flatMap(Answers, (answers) =>
      answers.settle(answerId, { _tag: 'NotAsked' }),
    ),
});
