import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Rolldown } from 'vite';
import type { OutputFile } from './precache/index.js';

/** Every file under `dir` (none when it does not exist), paths relative with `/`. */
export const readTree = async (dir: string): Promise<OutputFile[]> => {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return {
          path: relative(dir, path).split(sep).join('/'),
          bytes: new Uint8Array(await readFile(path)),
        };
      }),
  );
};

const encoder = new TextEncoder();

/** The files a Rolldown bundle is about to write. */
export const bundleFiles = (bundle: Rolldown.OutputBundle): OutputFile[] =>
  Object.values(bundle).map((file) => ({
    path: file.fileName,
    bytes:
      file.type === 'chunk'
        ? encoder.encode(file.code)
        : typeof file.source === 'string'
          ? encoder.encode(file.source)
          : file.source,
  }));

/** `later` wins over `earlier` for the same path, as a bundle output overwrites a public file. */
export const overlay = (
  earlier: ReadonlyArray<OutputFile>,
  later: ReadonlyArray<OutputFile>,
): OutputFile[] => {
  const paths = new Set(later.map((file) => file.path));
  return [...earlier.filter((file) => !paths.has(file.path)), ...later];
};
