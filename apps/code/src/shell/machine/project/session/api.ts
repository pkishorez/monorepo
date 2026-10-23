import { Effect, Schema } from 'effect';
import { AttachmentSchema, type AskAnswer } from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused, reasonOf } from '../../../../refusal/index.ts';

/*
 * What a session's page asks of the server: send a message, stop the
 * turn, fork after a turn, and ask a question on the side.
 */

/** A message to the session; `id` tells its answer apart from other sends'. */
export const send = Command.make('Send', {
  args: Schema.Struct({
    id: Schema.Finite,
    sessionId: Schema.String,
    text: Schema.String,
    attachments: Schema.Array(AttachmentSchema),
    /** Changes that hold from this message's turn on. */
    model: Schema.optionalKey(Schema.String),
    settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  run: ({ id, ...args }) =>
    AiClient.use((api) => api.send(args)).pipe(
      Effect.map(() => ({ _tag: 'Sent' as const, id })),
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'SendRefused' as const,
          id,
          reason: reasonOf(cause),
        }),
      ),
    ),
});

export const cancel = Command.make('Cancel', {
  args: Schema.Struct({ sessionId: Schema.String }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.cancel(args)),
      () => ({
        _tag: 'Stopped' as const,
      }),
    ),
});

/** A new Session from this one's context, up to a Turn's end. */
export const forkSession = Command.make('ForkSession', {
  args: Schema.Struct({
    sessionId: Schema.String,
    afterTurnId: Schema.String,
  }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.forkSession(args)),
      (session) => ({
        _tag: 'Forked' as const,
        projectId: session.projectId,
        sessionId: session.id,
      }),
    ),
});

/** An Ask's answer as a person reads it: its text, or its data as JSON. */
const answerText = (answer: AskAnswer) =>
  answer._tag === 'Text' ? answer.text : JSON.stringify(answer.data, null, 2);

/** A question to a Session's context, answered as text; `id` tells answers apart. */
export const ask = Command.make('Ask', {
  args: Schema.Struct({
    id: Schema.Finite,
    sessionId: Schema.String,
    question: Schema.String,
  }),
  run: ({ id, sessionId, question }) =>
    AiClient.use((api) => api.ask({ sessionId, question, schema: null })).pipe(
      Effect.map((answer) => ({
        _tag: 'Answered' as const,
        id,
        answer: answerText(answer),
      })),
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'AskRefused' as const,
          id,
          reason: reasonOf(cause),
        }),
      ),
    ),
});
