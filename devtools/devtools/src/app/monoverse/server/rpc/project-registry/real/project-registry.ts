import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { Effect } from 'effect';
import {
  ProjectStore,
  ProjectStoreError,
} from '../../../services/project-store/contract/index.js';
import { ProjectRegistryError, ProjectRegistryRpc } from '../contract/index.js';

const toRpcError = (cause: unknown) =>
  new ProjectRegistryError({
    reason: 'store',
    message:
      cause instanceof ProjectStoreError
        ? `${cause.operation}: ${cause.cause}`
        : String(cause),
  });

const invalidPath = (message: string) =>
  new ProjectRegistryError({ reason: 'invalid-path', message });

/**
 * The folder a Project path names: absolute (`~` expanded), existing, a
 * folder, its symbolic links resolved so one folder is one Project.
 */
function projectFolder(path: string) {
  return Effect.gen(function* () {
    const trimmed = path.trim();
    const expanded =
      trimmed === '~'
        ? homedir()
        : trimmed.startsWith('~/')
          ? join(homedir(), trimmed.slice(2))
          : trimmed;
    if (!isAbsolute(expanded)) {
      return yield* invalidPath('A Project path must be absolute.');
    }
    const folder = yield* Effect.tryPromise({
      try: () => realpath(resolve(expanded)),
      catch: () => invalidPath(`${expanded} does not exist.`),
    });
    const entry = yield* Effect.tryPromise({
      try: () => stat(folder),
      catch: () => invalidPath(`${expanded} does not exist.`),
    });
    if (!entry.isDirectory()) {
      return yield* invalidPath(`${expanded} is not a folder.`);
    }
    return folder;
  });
}

/** Fulfils the Project registry RPC contract with the Project store. */
export const ProjectRegistryRpcLive = ProjectRegistryRpc.toLayer({
  ListProjects: () =>
    Effect.flatMap(ProjectStore, (store) => store.list()).pipe(
      Effect.mapError(toRpcError),
    ),
  AddProject: ({ path }) =>
    Effect.gen(function* () {
      const store = yield* ProjectStore;
      const folder = yield* projectFolder(path);
      return yield* store.add(folder).pipe(Effect.mapError(toRpcError));
    }),
  RemoveProject: ({ id }) =>
    Effect.flatMap(ProjectStore, (store) => store.remove(id)).pipe(
      Effect.map((removed) => ({ removed })),
      Effect.mapError(toRpcError),
    ),
});
