import { stat } from 'node:fs/promises';
import { Duration, Effect, Stream } from 'effect';
import type { Self } from '@kestack/kabuki';
import type { Project, ProjectFolder } from '../../../records/index.js';
import { Store } from '../../capabilities/index.js';

/*
 * The Folder Check: whether each Project's folder is still there, run by
 * the root while Ready.
 *
 * 1. `check` stats every Project's folder as it starts, then every minute,
 *    and Sends `FolderFound` for each one found changed; the root saves
 *    only those. The root starts it over on `FoldersAsked`.
 * 2. `failures` Sends `FoldersAsked` whenever a Session's Turn fails, as
 *    one in a folder gone does. The engine Sends it when a Project's Skills
 *    cannot be listed.
 */

export const EVERY = Duration.minutes(1);

/** What the Folder Check holds of the root: its Projects, and what it Sends. */
type Root = Self<
  { readonly projects: ReadonlyArray<Project> },
  unknown,
  | {
      readonly _tag: 'FolderFound';
      readonly id: string;
      readonly folder: ProjectFolder;
    }
  | { readonly _tag: 'FoldersAsked' }
>;

/** Whether a folder is there; one that is there but cannot be read is. */
const presenceOf = (path: string) =>
  Effect.promise(() =>
    stat(path).then(
      (found): ProjectFolder => (found.isDirectory() ? 'present' : 'missing'),
      (error: NodeJS.ErrnoException): ProjectFolder =>
        error.code === 'ENOENT' || error.code === 'ENOTDIR'
          ? 'missing'
          : 'present',
    ),
  );

const checkAll = (self: Root) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    yield* Effect.forEach(
      model.projects,
      (project) =>
        Effect.flatMap(presenceOf(project.path), (folder) =>
          folder === project.folder
            ? Effect.void
            : self.send({ _tag: 'FolderFound', id: project.id, folder }),
        ),
      { concurrency: 'unbounded', discard: true },
    );
  });

export const check = (self: Root) =>
  Effect.forever(Effect.andThen(checkAll(self), Effect.sleep(EVERY)));

export const failures = (self: Root) =>
  Effect.scoped(
    Effect.gen(function* () {
      const changes = yield* (yield* Store).sessions.changes;
      yield* Stream.runForEach(
        Stream.filter(changes, ({ value }) => value.status === 'failed'),
        () => self.send({ _tag: 'FoldersAsked' }),
      );
    }),
  );
