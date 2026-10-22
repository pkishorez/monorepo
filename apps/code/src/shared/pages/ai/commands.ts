import { Effect, Schedule, Schema, Stream } from 'effect';
import {
  AttachmentSchema,
  HarnessBinary,
  HarnessInfo,
  ModelInfo,
  SkillSchema,
  type AskAnswer,
  type HarnessName,
} from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * Every call the pages make to the server: the writes as Commands, the
 * reads as Effects a Worker runs, and the Background Jobs as a feed. Each ends in one Message, what came back
 * or why it was refused, in a sentence a person reads.
 * A call made while the socket is down waits for it to come back.
 */

/** A file on a message being written: what is sent, and its size to show. */
export const Attached = Schema.Struct({
  ...AttachmentSchema.fields,
  size: Schema.Finite,
});

/** Files as they are sent: without the sizes only the composer shows. */
export const wire = (attached: ReadonlyArray<typeof Attached.Type>) =>
  attached.map(({ name, mime, data }) => ({ name, mime, data }));

/** What a refused call ends with. */
export const Refused = { reason: Schema.String };

const refused = (cause: unknown) => {
  const tagged = cause as {
    readonly _tag?: string;
    readonly path?: string;
    readonly reason?: string;
    readonly message?: string;
  };
  switch (tagged._tag) {
    case 'FolderNotFound':
      return `No folder at ${tagged.path}`;
    case 'ProjectNotFound':
      return 'This project no longer exists';
    case 'SessionNotFound':
      return 'This session no longer exists';
    case 'UnknownHarness':
      return 'This server does not run that agent';
    case 'ModelsUnavailable':
      return 'Could not load the models';
    case 'NotForkable':
      return `It cannot be forked there: ${tagged.reason}`;
    case 'AskFailed':
    case 'InvalidBinary':
    case 'HarnessFailed':
    case 'SkillsUnavailable':
      return tagged.message ?? 'The server refused it';
    default:
      return cause instanceof Error ? cause.message : 'The server refused it';
  }
};

const settle = <A, M>(
  call: Effect.Effect<A, unknown, AiClient>,
  done: (value: A) => M,
) =>
  call.pipe(
    Effect.map(done),
    Effect.catch((cause) =>
      Effect.succeed({ _tag: 'Refused' as const, reason: refused(cause) }),
    ),
  );

/** Every agent the server runs, as a Message; a Worker reads it. */
export const loadHarnesses = settle(
  AiClient.use((api) => api.harnesses()),
  (harnesses) => ({ _tag: 'HarnessesLoaded' as const, harnesses }),
).pipe(
  Effect.map((result) =>
    result._tag === 'Refused'
      ? { _tag: 'HarnessesFailed' as const, reason: result.reason }
      : result,
  ),
);

/** The models an agent takes, newest first, as a Message; a Worker reads it. */
export const loadModels = (harness: HarnessName) =>
  settle(
    AiClient.use((api) => api.models({ harness })),
    (models) => ({ _tag: 'ModelsLoaded' as const, harness, models }),
  ).pipe(
    Effect.map((result) =>
      result._tag === 'Refused'
        ? { _tag: 'ModelsFailed' as const, harness, reason: result.reason }
        : result,
    ),
  );

/** The Skills an agent offers in a project's folder, or why they could not be read. */
export const loadSkills = (projectId: string, harness: HarnessName) =>
  settle(
    AiClient.use((api) => api.skills({ projectId, harness })),
    (skills) => ({ _tag: 'SkillsLoaded' as const, harness, skills }),
  ).pipe(
    Effect.map((result) =>
      result._tag === 'Refused'
        ? { _tag: 'SkillsFailed' as const, harness, reason: result.reason }
        : result,
    ),
  );

/** Every agent's Harness Binary, as a Message; a Worker reads it. */
export const loadBinaries = settle(
  AiClient.use((api) => api.harnessBinaries()),
  (binaries) => ({ _tag: 'BinariesLoaded' as const, binaries }),
);

/**
 * Every Session's Background Jobs, whole on each change. The server sends
 * the whole list first, so a reconnect starts from it afresh; a feed it
 * refuses is tried again a little later.
 */
export const backgroundJobs = keepSubscribed(() =>
  Stream.unwrap(Effect.map(AiClient, (api) => api.backgroundJobs())),
).pipe(
  Stream.retry(Schedule.spaced('5 seconds')),
  // Retried forever, so it never fails.
  Stream.orDie,
);

/** An Ask's answer as a person reads it: its text, or its data as JSON. */
const answerText = (answer: AskAnswer) =>
  answer._tag === 'Text' ? answer.text : JSON.stringify(answer.data, null, 2);

export const addProject = Command.make('AddProject', {
  args: Schema.Struct({ path: Schema.String }),
  run: ({ path }) =>
    settle(
      AiClient.use((api) => api.addProject({ path })),
      (project) => ({
        _tag: 'Added' as const,
        id: project.id,
      }),
    ),
});

export const removeProject = Command.make('RemoveProject', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    settle(
      AiClient.use((api) => api.removeProject({ id })),
      () => ({
        _tag: 'Removed' as const,
      }),
    ),
});

export const startSession = Command.make('StartSession', {
  args: Schema.Struct({
    projectId: Schema.String,
    harness: HarnessInfo.fields.name,
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
    text: Schema.String,
    attachments: Schema.Array(AttachmentSchema),
  }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.startSession(args)),
      (session) => ({
        _tag: 'Started' as const,
        sessionId: session.id,
      }),
    ),
});

export const send = Command.make('Send', {
  args: Schema.Struct({
    sessionId: Schema.String,
    text: Schema.String,
    attachments: Schema.Array(AttachmentSchema),
    /** Changes that hold from this message's turn on. */
    model: Schema.optionalKey(Schema.String),
    settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.send(args)),
      () => ({
        _tag: 'Sent' as const,
      }),
    ),
});

export const cancel = Command.make('Cancel', {
  args: Schema.Struct({ sessionId: Schema.String }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.cancel(args)),
      () => ({
        _tag: 'Stopped' as const,
      }),
    ),
});

/** A new Session from this one's context, up to a Turn's end; null, the latest. */
export const forkSession = Command.make('ForkSession', {
  args: Schema.Struct({
    sessionId: Schema.String,
    afterTurnId: Schema.NullOr(Schema.String),
  }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.forkSession(args)),
      (session) => ({
        _tag: 'Forked' as const,
        projectId: session.projectId,
        sessionId: session.id,
      }),
    ),
});

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
          reason: refused(cause),
        }),
      ),
    ),
});

export const regenerateTitle = Command.make('RegenerateTitle', {
  args: Schema.Struct({ sessionId: Schema.String }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.regenerateTitle(args)),
      () => ({ _tag: 'Retitled' as const }),
    ),
});

export const stopBackgroundJob = Command.make('StopBackgroundJob', {
  args: Schema.Struct({ sessionId: Schema.String, jobId: Schema.String }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.stopBackgroundJob(args)),
      () => ({ _tag: 'JobStopped' as const, jobId: args.jobId }),
    ).pipe(
      Effect.map((result) =>
        result._tag === 'Refused'
          ? {
              _tag: 'JobRefused' as const,
              jobId: args.jobId,
              reason: result.reason,
            }
          : result,
      ),
    ),
});

/** Sets an agent's Harness Binary; null goes back to its default. */
export const setHarnessBinary = Command.make('SetHarnessBinary', {
  args: Schema.Struct({
    harness: HarnessInfo.fields.name,
    path: Schema.NullOr(Schema.String),
  }),
  run: (args) =>
    settle(
      AiClient.use((api) => api.setHarnessBinary(args)),
      (binary) => ({ _tag: 'BinarySaved' as const, binary }),
    ).pipe(
      Effect.map((result) =>
        result._tag === 'Refused'
          ? {
              _tag: 'BinaryRefused' as const,
              harness: args.harness,
              reason: result.reason,
            }
          : result,
      ),
    ),
});

export { HarnessBinary, HarnessInfo, ModelInfo, SkillSchema };
