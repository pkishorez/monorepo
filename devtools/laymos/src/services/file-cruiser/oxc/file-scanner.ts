import { readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { Schema } from 'effect';

const MissingFileErrorSchema = Schema.Struct({
  code: Schema.Literal('ENOENT'),
});

export const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export async function listSourceFiles(
  baseDir: string,
  sourceRoots: readonly string[],
): Promise<string[]> {
  const files = new Set<string>();
  for (const sourceRoot of sourceRoots) {
    const absolute = resolve(baseDir, sourceRoot);
    const sourceRootStat = await statOrUndefined(absolute);
    if (sourceRootStat?.isFile()) {
      if (isSupportedSourceFile(sourceRoot)) files.add(sourceRoot);
      continue;
    }
    if (!sourceRootStat?.isDirectory()) continue;
    const entries = await readdir(absolute, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile() || !isSupportedSourceFile(entry.name)) continue;
      files.add(
        toPosixPath(relative(baseDir, resolve(entry.parentPath, entry.name))),
      );
    }
  }
  return [...files].sort();
}

export function pathContains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}

export function toPosixPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

async function statOrUndefined(path: string) {
  try {
    return await stat(path);
  } catch (cause) {
    if (Schema.is(MissingFileErrorSchema)(cause)) {
      return undefined;
    }
    throw cause;
  }
}

function isSupportedSourceFile(path: string): boolean {
  return (
    sourceExtensions.some((extension) => path.endsWith(extension)) &&
    !path.endsWith('.d.ts') &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) &&
    !/\.min\.(?:[cm]?js|jsx)$/.test(path)
  );
}
