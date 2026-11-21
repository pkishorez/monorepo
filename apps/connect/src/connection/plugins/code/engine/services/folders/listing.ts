import { Effect } from 'effect';
import type {
  AccessDenied,
  FileSystem,
  IoError,
  NotFound,
} from '../../capabilities/index.js';
import { join } from '../../paths/index.js';
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

/** The sub-folders of the real folder `path`; fails as the File System's `list` does. */
export const listEntries = (
  files: FileSystem['Service'],
  input: {
    readonly home: string;
    readonly path: string;
    readonly query: string;
    readonly limit: number;
  },
): Effect.Effect<
  { readonly entries: Array<Entry>; readonly truncated: boolean },
  NotFound | AccessDenied | IoError
> =>
  Effect.gen(function* () {
    const showHidden = input.query.startsWith('.');
    const needle = input.query.toLowerCase();
    const wanted = (name: string) =>
      (showHidden || !name.startsWith('.')) &&
      name.toLowerCase().includes(needle);
    const listed = (yield* files.list(input.path)).filter((entry) =>
      wanted(entry.name),
    );
    const found = yield* Effect.forEach(
      listed,
      (entry): Effect.Effect<Entry | null> => {
        if (entry.kind === 'folder')
          return Effect.succeed({
            name: entry.name,
            hidden: entry.hidden,
            link: false,
          });
        if (entry.kind !== 'symlink') return Effect.succeed(null);
        return Effect.map(
          resolveFolder(files, input.home, join(input.path, entry.name)),
          (target) =>
            target._tag === 'Folder'
              ? { name: entry.name, hidden: entry.hidden, link: true }
              : null,
        );
      },
      { concurrency: 'unbounded' },
    );
    const entries = found
      .filter((entry) => entry !== null)
      .sort((a, b) => collator.compare(a.name, b.name));
    return {
      entries: entries.slice(0, input.limit),
      truncated: entries.length > input.limit,
    };
  });
