import { changeTallies, statusOf, type ChangeStatus } from '../model/index.js';
import type { FolderEntry } from './actor.js';

/*
 * A folder's files as a tree, one row each, as the list draws them:
 * folders first, then files, each by name. A folder holding nothing but
 * one other folder shares its row with it, `src/app`, so a long path takes
 * one row, not one each. A folder takes the colour its changes roll up to.
 */

export type FileTreeRow =
  | {
      readonly kind: 'folder';
      /** Its path, relative to the root. */
      readonly path: string;
      /** Its name, or the names of the folders sharing its row. */
      readonly label: string;
      readonly depth: number;
      readonly open: boolean;
      readonly status: ChangeStatus | null;
    }
  | {
      readonly kind: 'file';
      readonly path: string;
      readonly name: string;
      readonly depth: number;
      readonly status: ChangeStatus | null;
    };

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
