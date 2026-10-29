import { Cause, Effect, Schema, Stream } from 'effect';
import {
  type AskAnswer,
  AttachmentSchema,
  CodeClient,
  type StartStepName,
} from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import { reasonOf } from '../../../../../connection/link/index.ts';
import { Handover, SessionArrival, SharedCatalog } from '../../store.ts';
import { Attached, wire } from '../draft.ts';

/*
 * What the Draft asks of its Connection, over the socket the project page
 * Provides: start a session with its first message, step by step, send
 * the next one, or ask the session on the side; and of the project, to
 * read its catalog again.
 */

/** What a new session is started with: its first message, its agent, and where it runs. */
export const StartArgs = Schema.Struct({
  projectId: Schema.String,
  /** The Harness Account it runs as. */
  account: Schema.String,
  model: Schema.String,
  settings: Schema.Record(Schema.String, Schema.String),
  text: Schema.String,
  attachments: Schema.Array(AttachmentSchema),
  /** The branch picked, local or Origin; null where the Project's folder is. */
  branch: Schema.NullOr(Schema.String),
  newWorktree: Schema.Boolean,
});
export type StartArgs = typeof StartArgs.Type;

/** Chooses the id a new session starts under, a ULID, so it is known whatever the answer. */
export const nameStart = Command.make('NameStart', {
  run: () =>
    Effect.map(nextUlid, (id) => ({ _tag: 'StartNamed' as const, id })),
});

/**
 * Starts a session already running its first message, under the id chosen
 * for it, and tells each StartStep as it comes. Started, the project page
 * is told (`Handover`) before it is moved to. Refused by the Connection,
 * for a project or an agent it does not have, or a git step that failed,
 * nothing was started, and the Draft says why. Any other way it ends, its
 * answer lost or the link down, it may well have started: it is moved to
 * once it shows among the Connection's sessions (`SessionArrival`), and if
 * it never does, the Draft says why, keeping what was written. Run by the
 * Draft's Worker while it starts; asked again with the same id, the
 * Connection starts nothing twice.
 */
export const starting = (
  id: string,
  args: StartArgs,
  send: (
    message:
      | {
          readonly _tag: 'Stepped';
          readonly step: StartStepName;
          readonly state: 'running' | 'done';
        }
      | { readonly _tag: 'Started'; readonly sessionId: string }
      | { readonly _tag: 'StartRefused'; readonly reason: string },
  ) => Effect.Effect<void>,
) => {
  const started = (sessionId: string) =>
    Effect.andThen(
      Effect.flatMap(Handover, ({ started }) => started(sessionId)),
      send({ _tag: 'Started', sessionId }),
    );
  return Stream.unwrap(
    Effect.map(CodeClient, (api) => api.startSession({ ...args, id })),
  ).pipe(
    Stream.runFoldEffect(
      () => false,
      (_, step) =>
        step._tag === 'Step'
          ? Effect.as(
              send({ _tag: 'Stepped', step: step.step, state: step.state }),
              false,
            )
          : Effect.as(started(step.session.id), true),
    ),
    // Ended with no Session said: its answer was lost.
    Effect.flatMap((came) =>
      came ? Effect.void : Effect.fail(new Error('It ended before starting')),
    ),
    // Every way it fails, a lost answer's defect too; stopped, it ends.
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : refusedByConnection(Cause.squash(cause))
          ? send({ _tag: 'StartRefused', reason: whyOf(cause) })
          : Effect.flatMap(
              Effect.flatMap(SessionArrival, ({ arrived }) => arrived(id)),
              (came) =>
                came
                  ? started(id)
                  : send({ _tag: 'StartRefused', reason: whyOf(cause) }),
            ),
    ),
  );
};

/** A refusal the Connection made itself, so nothing was started. */
const refusedByConnection = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  (error._tag === 'ProjectNotFound' ||
    error._tag === 'UnknownAccount' ||
    error._tag === 'GitFailed');

/** Why a start failed, as a person reads it. */
const whyOf = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof error._tag === 'string' &&
    error._tag in REASONED
    ? reasonOf(error as Parameters<typeof reasonOf>[0])
    : 'The Connection could not be reached to start it';
};

/** The failures `reasonOf` reads. */
const REASONED = {
  ProjectNotFound: true,
  UnknownAccount: true,
  GitFailed: true,
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
