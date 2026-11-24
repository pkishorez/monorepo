import { readdir } from 'node:fs/promises';
import { relative, sep } from 'node:path';

import type { GitShape } from '../../git/contract/index.js';

/** Folders never walked when the root is outside git. */
const skipped = new Set(['node_modules', 'dist', 'build', 'coverage']);

/**
 * Every file under `root` that git knows, relative to it and sorted:
 * tracked, or new and not ignored; a tracked file deleted from the working
 * tree is left out, and nothing git ignores is ever listed. A root outside
 * git lists what is on disk instead, less installed packages, build output
 * and hidden folders.
 */
export async function listKnownFiles(
  git: GitShape,
  root: string,
): Promise<Array<string>> {
  const inside = await git.run(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return walk(root);
  const known = git.splitNul(
    await git.require(
      root,
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      'command-failed',
    ),
  );
  const deleted = new Set(
    git.splitNul(
      await git.require(
        root,
        ['ls-files', '--deleted', '-z'],
        'command-failed',
      ),
    ),
  );
  return [...new Set(known)]
    .filter((path) => !deleted.has(path))
    .sort((left, right) => left.localeCompare(right));
}

async function walk(root: string): Promise<Array<string>> {
  const files: Array<string> = [];
  const visit = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = `${folder}${sep}${entry.name}`;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skipped.has(entry.name))
          await visit(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}
