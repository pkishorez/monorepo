import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitShape } from '../../git/contract/index.js';
import type { Snapshot } from '../contract/index.js';
import { listKnownFiles } from './known-files.js';

/** How many files are read at once. */
const concurrency = 32;

/**
 * The Project at `root` as the folder `folder` holds it on disk, uncommitted
 * work included: `root` itself, or its copy inside another worktree.
 */
export function diskSnapshot(
  git: GitShape,
  root: string,
  folder: string,
): Snapshot {
  const read = async (path: string): Promise<Uint8Array | undefined> => {
    try {
      return await readFile(join(folder, path));
    } catch (cause) {
      if (isMissing(cause)) return undefined;
      throw cause;
    }
  };
  return {
    root,
    source: { kind: 'disk', folder },
    list: async (inside) => {
      const at = join(folder, inside);
      if (!(await isDirectory(at))) return [];
      const files = await listKnownFiles(git, at);
      return inside === '' ? files : files.map((file) => `${inside}/${file}`);
    },
    read,
    onDisk: async () => folder,
    readMany: async (paths) => {
      const found = new Map<string, Uint8Array>();
      let next = 0;
      const work = async () => {
        while (next < paths.length) {
          const path = paths[next++]!;
          const bytes = await read(path);
          if (bytes !== undefined) found.set(path, bytes);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, work));
      return found;
    },
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isMissing(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause.code === 'ENOENT' ||
      cause.code === 'ENOTDIR' ||
      cause.code === 'EISDIR')
  );
}
