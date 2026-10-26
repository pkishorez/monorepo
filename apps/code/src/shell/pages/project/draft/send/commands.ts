import { Cause, Effect, Schema } from 'effect';
import {
  type AskAnswer,
  AttachmentSchema,
  CodeClient,
} from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import { reasonOf } from '../../../../machines/index.ts';
import { SessionArrival, SharedCatalog } from '../../capabilities/index.ts';
import { Attached, wire } from '../message.ts';

/*
 * What the Draft asks of its Machine, over the socket the project page
 * Provides: start a session with its first message, send the next one,
 * or ask the session on the side; and of the project, to read its catalog
 * again.
 */

/**
 * Starts a session already running its first message, under an id chosen
 * here, so the session is known whatever the answer. Started, it is moved
 * to. Refused by the Machine, for a project or an agent it does not have,
 * nothing was started, and the Draft says why. Any other way it ends, its
 * answer lost or the line down, it may well have started: it is moved to
 * once it shows among the Machine's sessions (`SessionArrival`), and if it
 * never does, the Draft says why, keeping what was written. Never asked
 * again, so it never starts twice, whatever Connect the Machine runs.
 */
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
    Effect.gen(function* () {
      const id = yield* nextUlid;
      const started = (sessionId: string) => ({
        _tag: 'Started' as const,
        sessionId,
      });
      const refused = (cause: Cause.Cause<unknown>) => ({
        _tag: 'StartRefused' as const,
        reason: whyOf(cause),
      });
      return yield* CodeClient.use((api) =>
        api.startSession({ ...args, id }),
      ).pipe(
        Effect.map((session) => started(session.id)),
        // Every way it fails, a lost answer's defect too; stopped, it ends.
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : refusedByMachine(Cause.squash(cause))
              ? Effect.succeed(refused(cause))
              : Effect.map(
                  Effect.flatMap(SessionArrival, ({ arrived }) => arrived(id)),
                  (came) => (came ? started(id) : refused(cause)),
                ),
        ),
      );
    }),
});

/** A refusal the Machine made itself, so nothing was started. */
const refusedByMachine = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  (error._tag === 'ProjectNotFound' || error._tag === 'UnknownAccount');

/** Why a start failed, as a person reads it. */
const whyOf = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof error._tag === 'string' &&
    error._tag in REASONED
    ? reasonOf(error as Parameters<typeof reasonOf>[0])
    : 'The Machine could not be reached to start it';
};

/** The failures `reasonOf` reads. */
const REASONED = {
  ProjectNotFound: true,
  UnknownAccount: true,
  RpcClientError: true,
};

/**
 * A message to the session. Refused, its text and files come back to the
 * Draft; one refused after the Draft has gone is lost, as its Saved Draft
 * no longer holds it.
 */
export const send = Command.make('Send', {
  args: Schema.Struct({
    sessionId: Schema.String,
    text: Schema.String,
    attachments: Schema.Array(Attached),
    /** Changes that hold from this message's turn on. */
    model: Schema.optionalKey(Schema.String),
    settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  run: ({ attachments, ...args }) =>
    CodeClient.use((api) =>
      api.send({ ...args, attachments: wire(attachments) }),
    ).pipe(
      Effect.asVoid,
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'SendRefused' as const,
          text: args.text,
          attachments,
          reason: reasonOf(cause),
        }),
      ),
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
