import { Effect, Schema } from 'effect';
import { QuestionAnswerSchema } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../../../../../connection/link/index.ts';
import { answerQuestion } from '../../../../../connection/records/index.ts';

/*
 * What the Question Panel asks of the session's Connection: the answer to an
 * Agent Question, or, with null, that it is declined. One no longer asked,
 * as when another device answered it first or its Turn ended, is as good
 * as answered: there is nothing left to send.
 */

export const answer = Command.make('AnswerQuestion', {
  args: Schema.Struct({
    sessionId: Schema.String,
    questionId: Schema.String,
    answer: Schema.NullOr(QuestionAnswerSchema),
  }),
  run: (args) =>
    orRefused(
      answerQuestion(args).pipe(
        Effect.catchTag('QuestionNotAsked', () => Effect.void),
      ),
      () => ({ _tag: 'Answered' as const, questionId: args.questionId }),
    ),
});
