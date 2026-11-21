import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveFolder } from './home.js';

/*
 * One folder's sub-folders, as a picker lists them. Hidden ones (a name
 * starting with `.`) show only for a query that starts with `.`; a query
 * keeps the names holding it, any case. A symlink counts when it leads to
 * a folder inside home. Names are sorted as a person reads them, and at
 * most `limit` are kept.
 */

export interface Entry {
  readonly name: string;
  readonly hidden: boolean;
  /** A symlink to a folder, not a folder itself. */
  readonly link: boolean;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** The sub-folders of the real folder `path`; throws as `readdir` does. */
export const listEntries = async (input: {
  readonly home: string;
  readonly path: string;
  readonly query: string;
  readonly limit: number;
}): Promise<{
  readonly entries: Array<Entry>;
  readonly truncated: boolean;
}> => {
  const showHidden = input.query.startsWith('.');
  const needle = input.query.toLowerCase();
  const wanted = (name: string) =>
    (showHidden || !name.startsWith('.')) &&
    name.toLowerCase().includes(needle);
  const dirents = (await readdir(input.path, { withFileTypes: true })).filter(
    (dirent) => wanted(dirent.name),
  );
  const found = await Promise.all(
    dirents.map(async (dirent): Promise<Entry | null> => {
      const hidden = dirent.name.startsWith('.');
      if (dirent.isDirectory())
        return { name: dirent.name, hidden, link: false };
      if (!dirent.isSymbolicLink()) return null;
      const target = await resolveFolder(
        input.home,
        join(input.path, dirent.name),
      );
      return target._tag === 'Folder'
        ? { name: dirent.name, hidden, link: true }
        : null;
    }),
  );
  const entries = found
    .filter((entry) => entry !== null)
    .sort((a, b) => collator.compare(a.name, b.name));
  return {
    entries: entries.slice(0, input.limit),
    truncated: entries.length > input.limit,
  };
};
