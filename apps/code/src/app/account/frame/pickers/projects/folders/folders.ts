import { Effect } from 'effect';
import { addProject, createFolder, listFolder } from './api.ts';
import { HOME, inside, walk } from './path.ts';
import { homeOf, keyAt, placeOf } from './place.ts';

/*
 * The folder Steps of the Project Picker: one Step per folder gone into,
 * on the Connection picked, from its home folder down, never above it. Each
 * Step's key names the Connection and the folder (`place.ts`).
 *
 * 1. List     a folder's sub-folders, from the server, at most 100: a
 *             listing cut short is asked again for the search, and hidden
 *             folders are asked for only by a search starting with `.`.
 * 2. Go       Enter or Ctrl+L goes into the folder highlighted, and Ctrl+H
 *             or Backspace back out; a path typed (`~/code/fo`) goes to
 *             its folder and searches it for what follows the last `/`.
 * 3. Choose   Mod+Enter chooses the folder highlighted, and "Open this
 *             folder" the folder open, under its path on touch; a search
 *             that names no folder offers to create it there, and on touch
 *             "New folder" makes one, with git init, and goes into it. Either way it becomes a
 *             Project, or opens the one it already is, while the Picker
 *             waits; a refusal is said in the Step.
 */

const CREATE = 'create:';

type At = { readonly key: string; readonly query: string };
type Row = { readonly value: string; readonly label: string };
type Choice = {
  readonly step: string;
  readonly key: string;
  readonly value: string;
};

/** The folder Steps, for the Picker that holds them, under the id `folder`. */
const steps = {
  folder: {
    placeholder: ({ key }: At) => {
      const { path } = placeOf(key);
      return path === HOME
        ? 'Search your home folder, or type a path'
        : `Search ${path}`;
    },
    title: ({ key }: At) => (placeOf(key).path === HOME ? HOME : null),
    empty: () => 'No folder by that name',
    // 2. Go
    next: (row: Row) =>
      row.value.startsWith(CREATE) ? null : { id: 'folder', key: row.value },
    goes: (query: string, { key }: At) => {
      const { connectionId, path } = placeOf(key);
      const walked = walk(path, query);
      if (walked === null) return null;
      return {
        steps: walked.folders.map((folder) => ({
          step: { id: 'folder', key: keyAt(connectionId, folder.key) },
          value: keyAt(connectionId, folder.key),
          label: folder.name,
        })),
        query: walked.query,
      };
    },
    // 1. List: hidden folders are another listing.
    scope: (query: string) => (query.startsWith('.') ? 'hidden' : ''),
    // 3. Choose
    pinned: ({ key, query }: At, rows: ReadonlyArray<Row>) => {
      const name = query.trim();
      const named = rows.some(
        ({ label }) => label.toLowerCase() === name.toLowerCase(),
      );
      return name === '' || name.includes('/') || named
        ? []
        : [
            {
              value: `${CREATE}${name}`,
              label: `Create “${name}” here`,
              detail: `A new folder in ${placeOf(key).path}, with a git repository`,
            },
          ];
    },
    finishes: 'step' as const,
    done: () => 'Open this folder',
    where: ({ key }: At) => `${placeOf(key).path}/`,
    make: 'New folder',
    icon: 'folder' as const,
    settles: true,
  },
};

/** 1. List: the rows of the folder Step `key`, for its search. */
const load = (key: string, query: string) => {
  const { connectionId, path } = placeOf(key);
  return listFolder(connectionId, path, query).pipe(
    Effect.map((listing) => ({
      rows: listing.folders.map(({ name, link }) => ({
        value: keyAt(connectionId, inside(path, name)),
        label: name,
        ...(link ? { hint: 'link' } : {}),
      })),
      truncated: listing.truncated,
      problem: null,
    })),
    Effect.catch((problem) =>
      Effect.succeed({ rows: [], truncated: false, problem }),
    ),
  );
};

/**
 * 3. Choose: the Project the folder Step `key` finished on, made from the
 * folder created there if a Create row was picked; with why `git init`
 * failed, if it did. Fails with why, as a sentence.
 */
const choose = (choices: ReadonlyArray<Choice>, key: string) =>
  Effect.gen(function* () {
    const { connectionId, path } = placeOf(key);
    const last = choices.at(-1);
    const name =
      last?.step === 'folder' &&
      last.key === key &&
      last.value.startsWith(CREATE)
        ? last.value.slice(CREATE.length)
        : null;
    const created =
      name === null ? null : yield* createFolder(connectionId, path, name);
    const project = yield* addProject(connectionId, created?.path ?? path);
    return {
      connectionId,
      projectId: project.id,
      gitInitError: created?.gitInitError ?? null,
      path: project.path,
    };
  });

/**
 * Makes the folder `name` in the folder Step `key`, with git init: the row
 * it is, to go into, or why not. A `git init` that failed is no refusal:
 * the folder is there.
 */
const make = (key: string, name: string) => {
  const { connectionId, path } = placeOf(key);
  if (name.includes('/'))
    return Effect.succeed({ refused: 'A folder name has no “/”' });
  return createFolder(connectionId, path, name).pipe(
    Effect.map(() => ({
      row: { value: keyAt(connectionId, inside(path, name)), label: name },
    })),
    Effect.catch((refused) => Effect.succeed({ refused })),
  );
};

export const FolderPicker = {
  steps,
  load,
  choose,
  make,
  /** The first folder Step, a Connection's home, searching `query`. */
  opens: (connectionId: string, query: string) => ({
    id: 'folder',
    key: homeOf(connectionId),
    query,
  }),
} as const;
