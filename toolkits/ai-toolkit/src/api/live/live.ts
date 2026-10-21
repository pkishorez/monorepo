import { Effect } from 'effect';
import {
  AiApi,
  FolderNotFound,
  ModelsUnavailable,
  ProjectNotFound,
  SessionNotFound,
  UnknownHarness,
} from '../contract/index.js';
import { Engine } from '../../engine/index.js';
import { Harnesses } from '../../harness/index.js';
import { Models } from './models/index.js';
import * as Read from './read/index.js';

/*
 * The API's handlers. Commands go to the Engine, which hands them to its
 * actors; feeds read the Store; neither decides anything itself. Engine
 * failures become the contract's errors of the same name.
 */

/** The handlers of `AiApi`, over the Engine, the Store and the harnesses. */
export const AiApiLive = AiApi.toLayer(
  Effect.gen(function* () {
    const engine = yield* Engine;
    const harnesses = yield* Harnesses;
    const models = yield* Models;
    return {
      harnesses: () =>
        Effect.succeed(
          harnesses.all.map((harness) => ({
            name: harness.name,
            label: harness.label,
            settings: harness.settings,
            defaultModel: harness.defaultModel,
          })),
        ),
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
        engine
          .removeProject(id)
          .pipe(Effect.mapError((error) => new ProjectNotFound(error))),
      startSession: (input) =>
        engine
          .startSession(input)
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'ProjectNotFound'
                ? new ProjectNotFound({ id: error.id })
                : new UnknownHarness({ harness: error.harness }),
            ),
          ),
      send: ({ sessionId, text }) =>
        engine
          .send(sessionId, text)
          .pipe(Effect.mapError((error) => new SessionNotFound(error))),
      cancel: ({ sessionId }) =>
        engine
          .cancel(sessionId)
          .pipe(Effect.mapError((error) => new SessionNotFound(error))),
      projects: ({ after }) => Read.projects(after),
      sessions: ({ after }) => Read.sessions(after),
      messages: ({ sessionId, after }) => Read.messages(sessionId, after),
    };
  }),
);
