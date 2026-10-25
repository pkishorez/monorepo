import { Effect, Fiber, Schema } from 'effect';
import {
  type AskAnswer,
  AttachmentSchema,
  CodeClient,
} from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { orRefused, reasonOf } from '../../../machines/index.ts';
import { SharedCatalog } from '../capabilities/index.ts';
import { Attached, wire } from './message.ts';
import { hold, refused, taken, Where } from './saved.ts';

/*
 * What the Draft asks of its Machine, over the socket the project page
 * Provides: start a session with its first message, send the next one,
 * held in its Saved Draft until answered, or ask the session on the side;
 * and of the project, to read its catalog again.
 */

/** Starts a session already running its first message. */
export const startSession = Command.make('StartSession', {
  args: Schema.Struct({
    projectId: Schema.String,
    /** The Harness Account it runs as. */
    account: Schema.String,
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
    text: Schema.String,
    attachments: Schema.Array(AttachmentSchema),
  }),
  run: (args) =>
    orRefused(
      CodeClient.use((api) => api.startSession(args)),
      (session) => ({
        _tag: 'Started' as const,
        sessionId: session.id,
      }),
    ).pipe(
      Effect.map((ended) =>
        ended._tag === 'Refused'
          ? { _tag: 'StartRefused' as const, reason: ended.reason }
          : ended,
      ),
    ),
});

/**
 * A message to the session; `id` tells its answer apart from other sends'.
 * Held in its Saved Draft until the Machine answers, and the answer kept
 * there even once the Draft has gone, so a refused one comes back.
 */
export const send = Command.make('Send', {
  args: Schema.Struct({
    id: Schema.Finite,
    /** Where it is held; null with nobody signed in. */
    where: Schema.NullOr(Where),
    sessionId: Schema.String,
    text: Schema.String,
    attachments: Schema.Array(Attached),
    /** Changes that hold from this message's turn on. */
    model: Schema.optionalKey(Schema.String),
    settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  run: ({ id, where, attachments, ...args }) =>
    Effect.gen(function* () {
      const key = crypto.randomUUID();
      const sending = Effect.gen(function* () {
        const held =
          where === null
            ? null
            : yield* hold(where, { key, text: args.text, attachments });
        const reason = yield* CodeClient.use((api) =>
          api.send({ ...args, attachments: wire(attachments) }),
        ).pipe(
          Effect.as(null),
          Effect.catch((cause) => Effect.succeed(reasonOf(cause))),
        );
        if (where !== null)
          yield* reason === null
            ? taken(where, key, held)
            : refused(where, key, reason);
        return reason;
      });
      // Past the Draft: the answer is kept even once it has gone.
      const reason = yield* Fiber.join(yield* Effect.forkDetach(sending));
      return reason === null
        ? { _tag: 'Sent' as const, id }
        : { _tag: 'SendRefused' as const, id, key, reason };
    }),
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
    CodeClient.use((api) =>
      api.ask({ sessionId, question, schema: null }),
    ).pipe(
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

/** Asks the project to read again what of its catalog could not be read. */
export const retryCatalog = Command.make('RetryCatalog', {
  run: () => Effect.flatMap(SharedCatalog, ({ retry }) => retry),
});
