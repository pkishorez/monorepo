import { Effect, Schema } from 'effect';
import {
  AiApi,
  AskFailed,
  FolderExists,
  FolderNotFound,
  FolderUnreadable,
  HarnessFailed,
  InvalidBinary,
  InvalidFolderName,
  ModelsUnavailable,
  NotForkable,
  OutsideHome,
  PermissionDenied,
  ProjectNotFound,
  SessionNotFound,
  SkillsUnavailable,
  UnknownHarness,
} from '../contract/index.js';
import { Engine } from '../../engine/index.js';
import { Folders } from '../../folders/index.js';
import { Harnesses } from '../../harness/index.js';
import { JsonSchema } from '../../raw/index.js';
import { Models } from './models/index.js';
import * as Read from './read/index.js';

/*
 * The API's handlers. Commands go to the Engine, which hands them to its
 * actors, or to Folders; feeds read the Store; none decides anything
 * itself. Their failures become the contract's errors of the same name.
 */

type Listed = Effect.Error<ReturnType<Folders['Service']['list']>>;
type Created = Effect.Error<ReturnType<Folders['Service']['create']>>;

/** A Folders failure as the contract's error of the same name. */
function folderError(
  error: Listed,
): FolderNotFound | PermissionDenied | OutsideHome | FolderUnreadable;
function folderError(
  error: Created,
):
  | FolderNotFound
  | PermissionDenied
  | OutsideHome
  | FolderExists
  | InvalidFolderName;
function folderError(error: Listed | Created) {
  switch (error._tag) {
    case 'FolderNotFound':
      return new FolderNotFound({ path: error.path });
    case 'PermissionDenied':
      return new PermissionDenied({ path: error.path });
    case 'FolderExists':
      return new FolderExists({ path: error.path });
    case 'InvalidFolderName':
      return new InvalidFolderName({ name: error.name, reason: error.reason });
    case 'OutsideHome':
      return new OutsideHome({ path: error.path });
    case 'FolderUnreadable':
      return new FolderUnreadable({ path: error.path, message: error.message });
  }
}

/** An engine failure as the contract's error of the same name. */
const wire = {
  ProjectNotFound: (error: { readonly id: string }) =>
    new ProjectNotFound({ id: error.id }),
  SessionNotFound: (error: { readonly id: string }) =>
    new SessionNotFound({ id: error.id }),
  HarnessFailed: (error: { readonly message: string }) =>
    new HarnessFailed({ message: error.message }),
};

const decodeSchema = Schema.decodeUnknownEffect(Schema.NullOr(JsonSchema));

/** The handlers of `AiApi`, over the Engine, the Store and the harnesses. */
export const AiApiLive = AiApi.toLayer(
  Effect.gen(function* () {
    const engine = yield* Engine;
    const harnesses = yield* Harnesses;
    const models = yield* Models;
    const folders = yield* Folders;
    return {
      harnesses: () =>
        Effect.gen(function* () {
          const binaries = yield* engine.harnessBinaries;
          return yield* Effect.forEach(
            harnesses.all,
            (harness) =>
              Effect.map(models.defaultModel(harness), (defaultModel) => {
                const error =
                  binaries.find((row) => row.harness === harness.name)?.resolved
                    .error ?? null;
                return {
                  name: harness.name,
                  label: harness.label,
                  settings: harness.settings,
                  defaultModel,
                  available: error === null,
                  unavailableReason: error,
                };
              }),
            { concurrency: 'unbounded' },
          );
        }),
      models: ({ harness: name }) => {
        const harness = harnesses.all.find((each) => each.name === name);
        if (!harness) return Effect.succeed([]);
        return models
          .list(harness)
          .pipe(
            Effect.mapError(
              (error) => new ModelsUnavailable({ message: error.message }),
            ),
          );
      },
      addProject: ({ path }) =>
        engine
          .addProject(path)
          .pipe(Effect.mapError((error) => new FolderNotFound(error))),
      removeProject: ({ id }) =>
        engine.removeProject(id).pipe(Effect.mapError(wire.ProjectNotFound)),
      startSession: (input) =>
        engine
          .startSession(input)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'ProjectNotFound'
                ? wire.ProjectNotFound(error)
                : new UnknownHarness({ harness: error.harness }),
            ),
          ),
      send: ({ sessionId, ...message }) =>
        engine
          .send(sessionId, message)
          .pipe(Effect.mapError(wire.SessionNotFound)),
      cancel: ({ sessionId }) =>
        engine.cancel(sessionId).pipe(Effect.mapError(wire.SessionNotFound)),
      settleSession: ({ sessionId }) =>
        engine
          .settleSession(sessionId)
          .pipe(Effect.mapError(wire.SessionNotFound)),
      unsettleSession: ({ sessionId }) =>
        engine
          .unsettleSession(sessionId)
          .pipe(Effect.mapError(wire.SessionNotFound)),
      forkSession: ({ sessionId, afterTurnId }) =>
        engine
          .forkSession(sessionId, afterTurnId)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'SessionNotFound'
                ? wire.SessionNotFound(error)
                : new NotForkable({ reason: error.reason }),
            ),
          ),
      ask: ({ sessionId, question, schema }) =>
        Effect.gen(function* () {
          const json = yield* decodeSchema(schema).pipe(
            Effect.mapError(
              () => new AskFailed({ message: 'The schema given is not JSON' }),
            ),
          );
          return yield* engine
            .ask(sessionId, question, json)
            .pipe(
              Effect.mapError((error) =>
                error._tag === 'SessionNotFound'
                  ? wire.SessionNotFound(error)
                  : new AskFailed({ message: error.message }),
              ),
            );
        }),
      regenerateTitle: ({ sessionId }) =>
        engine
          .regenerateTitle(sessionId)
          .pipe(Effect.mapError(wire.SessionNotFound)),
      skills: ({ projectId, harness }) =>
        engine
          .skills(projectId, harness)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'ProjectNotFound'
                ? wire.ProjectNotFound(error)
                : new SkillsUnavailable({ message: error.message }),
            ),
          ),
      mcpStatus: ({ sessionId }) =>
        engine
          .mcpStatus(sessionId)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'SessionNotFound'
                ? wire.SessionNotFound(error)
                : wire.HarnessFailed(error),
            ),
          ),
      contextUsage: ({ sessionId }) =>
        engine
          .contextUsage(sessionId)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'SessionNotFound'
                ? wire.SessionNotFound(error)
                : wire.HarnessFailed(error),
            ),
          ),
      backgroundJobs: () => engine.backgroundJobs,
      stopBackgroundJob: ({ sessionId, jobId }) =>
        engine
          .stopBackgroundJob(sessionId, jobId)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'SessionNotFound'
                ? wire.SessionNotFound(error)
                : wire.HarnessFailed(error),
            ),
          ),
      harnessBinaries: () => engine.harnessBinaries,
      setHarnessBinary: ({ harness, path }) =>
        engine
          .setHarnessBinary(harness, path)
          .pipe(
            Effect.mapError(
              (error) => new InvalidBinary({ message: error.message }),
            ),
          ),
      listFolder: (input) =>
        folders
          .list(input)
          .pipe(Effect.mapError((error) => folderError(error))),
      createFolder: (input) =>
        folders
          .create(input)
          .pipe(Effect.mapError((error) => folderError(error))),
      projects: ({ after }) => Read.projects(after),
      sessions: ({ after }) => Read.sessions(after),
      messages: ({ sessionId, after }) => Read.messages(sessionId, after),
    };
  }),
);
