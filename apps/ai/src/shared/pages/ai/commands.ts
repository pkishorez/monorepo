import { Effect, Schema } from 'effect';
import {
  HarnessInfo,
  ModelInfo,
  type HarnessName,
} from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';

/*
 * Every call the pages make to the server: the writes as Commands, the two
 * reads as Effects a Worker runs. Each ends in one Message, what came back
 * or why it was refused, in a sentence a person reads.
 * A call made while the socket is down waits for it to come back.
 */

/** What a refused call ends with. */
export const Refused = { reason: Schema.String };

const refused = (cause: unknown) => {
  const tagged = cause as { readonly _tag?: string; readonly path?: string };
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
  args: Schema.Struct({ sessionId: Schema.String, text: Schema.String }),
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

export { HarnessInfo, ModelInfo };
