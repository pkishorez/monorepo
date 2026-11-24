import {
  changeTallies,
  isIgnored,
  statusOf,
} from '../../../../logic/shared/index.js';
import {
  defaultSettings,
  type FileTreeRow,
  type FolderState,
  type FolderEntry,
  type FolderSettings,
} from './shape.js';

/** What the list shows, by path, by the settings. */
export function entriesOf(
  state: FolderState,
  settings: FolderSettings = defaultSettings,
): ReadonlyArray<FolderEntry> {
  const statusOf = new Map(
    state.base === null
      ? []
      : state.changed.map(({ path, status }) => [path, status] as const),
  );
  const paths =
    state.base === null
      ? state.files
      : settings.unchanged === 'hide'
        ? [...statusOf.keys()]
        : [...new Set([...state.files, ...statusOf.keys()])];
  const entries: Array<FolderEntry> = [];
  for (const path of paths) {
    const status = statusOf.get(path) ?? null;
    if (status === 'deleted' && !settings.deleted) continue;
    const ignored = isIgnored(path, state.sourceRoots);
    if (ignored && !settings.ignored) continue;
    entries.push({ path, status, ignored });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

// The list with every folder open, worked out once for each list and its
// settings: every step, and the buttons either side of the file shown,
// read it, and a Monorepo's list holds thousands of files.
let lastOpen: {
  readonly key: ReadonlyArray<unknown>;
  readonly files: ReadonlyArray<string>;
  readonly folders: ReadonlyArray<string>;
} | null = null;

function allOpen(
  state: FolderState,
  settings: FolderSettings = defaultSettings,
) {
  const key = [
    state.path,
    state.base,
    state.files,
    state.changed,
    state.sourceRoots,
    settings.unchanged,
    settings.deleted,
    settings.ignored,
  ];
  if (lastOpen?.key.every((one, index) => one === key[index]) === true)
    return lastOpen;
  const rows = fileTreeRows(state.path, entriesOf(state, settings), new Set());
  lastOpen = {
    key,
    files: rows.flatMap((row) => (row.kind === 'file' ? [row.path] : [])),
    folders: rows.flatMap((row) => (row.kind === 'folder' ? [row.path] : [])),
  };
  return lastOpen;
}

/** Every file the list shows, in its order with every folder open. */
export const filesInOrder = (
  state: FolderState,
  settings?: FolderSettings,
): ReadonlyArray<string> => allOpen(state, settings).files;

/** Every folder the list can show, by the path of its row. */
export const foldersOf = (
  state: FolderState,
  settings?: FolderSettings,
): ReadonlyArray<string> => allOpen(state, settings).folders;

/** The files a step goes between: the changed ones while Changes is on, else all. */
export function stepsOf(
  state: FolderState,
  settings?: FolderSettings,
): ReadonlyArray<string> {
  const order = filesInOrder(state, settings);
  if (state.base === null) return order;
  const changed = new Set(state.changed.map(({ path }) => path));
  return order.filter((path) => changed.has(path));
}

/** The file shown: the one chosen while the list shows it, else the first step. */
export function shownOf(
  state: FolderState,
  settings?: FolderSettings,
): string | null {
  const order = filesInOrder(state, settings);
  if (state.selected !== null && order.includes(state.selected))
    return state.selected;
  return stepsOf(state, settings)[0] ?? order[0] ?? null;
}

/**
 * The step `by` from the file shown: through the steps, from where it
 * sits in the list's order when it is not one; none past either end.
 */
export function stepFrom(
  state: FolderState,
  settings: FolderSettings | undefined,
  by: number,
): string | null {
  const steps = stepsOf(state, settings);
  const shown = shownOf(state, settings);
  if (shown === null || steps.length === 0 || by === 0) return null;
  let at = steps.indexOf(shown);
  if (at === -1) {
    // Between two steps: the first one past it is a step of one.
    const order = filesInOrder(state, settings);
    const place = order.indexOf(shown);
    const after = steps.findIndex((path) => order.indexOf(path) > place);
    const first = after === -1 ? steps.length : after;
    at = by > 0 ? first - 1 : first;
  }
  const next = steps[at + by];
  return next === undefined || next === shown ? null : next;
}

/*
 * A folder's files as a tree, one row each, as the list draws them:
 * folders first, then files, each by name. A folder holding nothing but
 * one other folder shares its row with it, `src/app`, so a long path takes
 * one row, not one each. A folder takes the colour its changes roll up to.
 */

interface Folder {
  readonly path: string;
  readonly name: string;
  readonly folders: Map<string, Folder>;
  readonly files: Array<FolderEntry>;
}

const folder = (path: string, name: string): Folder => ({
  path,
  name,
  folders: new Map(),
  files: [],
});

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/** The rows of the files in `base`, those in a closed folder left out. */
export function fileTreeRows(
  base: string,
  entries: ReadonlyArray<FolderEntry>,
  closed: ReadonlySet<string>,
): ReadonlyArray<FileTreeRow> {
  const top = folder(base, '');
  for (const entry of entries) {
    const relative =
      base === '' ? entry.path : entry.path.slice(base.length + 1);
    const parts = relative.split('/');
    let at = top;
    for (const name of parts.slice(0, -1)) {
      let next = at.folders.get(name);
      if (next === undefined) {
        next = folder(at.path === '' ? name : `${at.path}/${name}`, name);
        at.folders.set(name, next);
      }
      at = next;
    }
    at.files.push(entry);
  }

  const tallies = changeTallies(
    entries.flatMap(({ path, status }) =>
      status === null ? [] : [{ path, status }],
    ),
  );

  const rows: Array<FileTreeRow> = [];
  const draw = (at: Folder, depth: number) => {
    for (const child of [...at.folders.values()].sort(byName)) {
      let shown = child;
      let label = child.name;
      while (shown.files.length === 0 && shown.folders.size === 1) {
        shown = [...shown.folders.values()][0]!;
        label = `${label}/${shown.name}`;
      }
      const open = !closed.has(shown.path);
      const tally = tallies.get(shown.path);
      rows.push({
        kind: 'folder',
        path: shown.path,
        label,
        depth,
        open,
        status: tally === undefined ? null : statusOf(tally),
      });
      if (open) draw(shown, depth + 1);
    }
    const files = at.files.map(({ path, status }) => ({
      kind: 'file' as const,
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      depth,
      status,
    }));
    rows.push(...files.sort(byName));
  };
  draw(top, 0);
  return rows;
}
