import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { indexFiles, joinPath, parentOf } from '../shared/tree/index.ts';

const sourceExtensions = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

/** A `.js` in an import names the `.ts` beside it, as TypeScript writes it. */
const compiledToSource: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
};

/** The file a relative import names, or `undefined` for a package or a file that is not there. */
export const resolveImport = (
  from: string,
  specifier: string,
): string | undefined => {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.resolve(parentOf(from), specifier);
  const extension = sourceExtensions.find((ext) => base.endsWith(ext));
  const stem = extension ? base.slice(0, -extension.length) : base;
  const candidates = [
    ...(extension
      ? (compiledToSource[extension] ?? [extension]).map((ext) => stem + ext)
      : sourceExtensions.map((ext) => base + ext)),
    ...indexFiles.map((file) => joinPath(base, file)),
  ];
  return candidates.find((file) => existsSync(file));
};
