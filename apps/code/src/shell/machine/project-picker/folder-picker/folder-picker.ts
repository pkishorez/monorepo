import { Effect } from 'effect';
import { addProject, createFolder, listFolder } from './api.ts';
import { HOME, inside, walk } from './path.ts';

/*
 * The folder Steps of the Project Picker: one Step per folder gone into,
 * from the home folder down, never above it.
 *
 * 1. List     a folder's sub-folders, from the server, at most 100: a
 *             listing cut short is asked again for the search, and hidden
 *             folders are asked for only by a search starting with `.`.
 * 2. Go       Enter or Ctrl+L goes into the folder highlighted, and Ctrl+H
 *             or Backspace back out; a path typed (`~/code/fo`) goes to
 *             its folder and searches it for what follows the last `/`.
 * 3. Choose   Mod+Enter chooses the folder open; a search that names no
 *             folder offers to create it there. Either way it becomes a
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
    placeholder: ({ key }: At) =>
      key === HOME
        ? 'Search your home folder, or type a path'
        : `Search ${key}`,
    title: ({ key }: At) => (key === HOME ? HOME : null),
    empty: () => 'No folder by that name',
    // 2. Go
    next: (row: Row) =>
      row.value.startsWith(CREATE) ? null : { id: 'folder', key: row.value },
    goes: (query: string, { key }: At) => {
      const path = walk(key, query);
      if (path === null) return null;
      return {
        steps: path.folders.map((folder) => ({
          step: { id: 'folder', key: folder.key },
          value: folder.key,
          label: folder.name,
        })),
        query: path.query,
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
              detail: `A new folder in ${key}, with a git repository`,
            },
          ];
    },
    finishes: 'step' as const,
    settles: true,
  },
};

/** 1. List: the rows of the folder Step `key`, for its search. */
const load = (key: string, query: string) =>
  listFolder(key, query).pipe(
    Effect.map((listing) => ({
      rows: listing.folders.map(({ name, link }) => ({
        value: inside(key, name),
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

/**
 * 3. Choose: the Project the folder Step `key` finished on, made from the
 * folder created there if a Create row was picked; with why `git init`
 * failed, if it did. Fails with why, as a sentence.
 */
const choose = (choices: ReadonlyArray<Choice>, key: string) =>
  Effect.gen(function* () {
    const last = choices.at(-1);
    const name =
      last?.step === 'folder' &&
      last.key === key &&
      last.value.startsWith(CREATE)
        ? last.value.slice(CREATE.length)
        : null;
    const created = name === null ? null : yield* createFolder(key, name);
    const project = yield* addProject(created?.path ?? key);
    return {
      projectId: project.id,
      gitInitError: created?.gitInitError ?? null,
      path: project.path,
    };
  });

export const FolderPicker = {
  steps,
  load,
  choose,
  /** The first folder Step, home, searching `query`. */
  opens: (query: string) => ({ id: 'folder', key: HOME, query }),
} as const;
