import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema } from '@kestack/std-toolkit/eschema';
import {
  AgentQuestionSchema,
  QuestionAnswerSchema,
} from '@kestack/ai-toolkit/contract';
import { HarnessFailed, QuestionNotAsked, SessionNotFound } from './errors.js';

/* Agent Questions: live only while their Turn runs, never stored. */

/** The Agent Questions one Session's running Turn waits on. */
export const SessionQuestions = ESchema.make('SessionQuestions', {
  sessionId: Schema.String,
  projectId: Schema.String,
  questions: Schema.Array(AgentQuestionSchema),
}).build();
export type SessionQuestions = typeof SessionQuestions.Type;

export const QuestionsRpc = RpcGroup.make(
  /** Every Session's Agent Questions, whole, then again on each change. */
  Rpc.make('agentQuestions', {
    success: Schema.Array(SessionQuestions.schema),
    stream: true,
  }),
  /**
   * Answers one of a Session's Agent Questions, or declines it with null;
   * QuestionNotAsked once it is no longer asked.
   */
  Rpc.make('answerQuestion', {
    payload: ESchema.make('AnswerQuestionPayload', {
      sessionId: Schema.String,
      questionId: Schema.String,
      answer: Schema.NullOr(QuestionAnswerSchema),
    }).build().schema,
    error: Schema.Union([SessionNotFound, QuestionNotAsked, HarnessFailed]),
  }),
);
