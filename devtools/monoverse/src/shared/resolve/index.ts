import { posix } from 'node:path';
import { indexFiles, joinPath, parentOf } from '../tree/index.ts';

/*
 * Which file a relative import names, the one way both the lint and the
 * DevTools find it, so they judge the same imports. Only a relative
 * specifier is followed: a package, a `#name` from package.json
 * `imports`, or a tsconfig `paths` alias is never judged.
 *
 * Whether a file is there is asked of `exists`: the disk for the lint,
 * the files git knows for the DevTools.
 */

/** The extensions of the files the rules read. */
export const sourceExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const;

/** A `.js` in an import names the `.ts` beside it, as TypeScript writes it. */
const compiledToSource: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};

/** Whether the rules follow `specifier`: it starts `./` or `../`, or is `.` or `..`. */
export const isRelative = (specifier: string): boolean =>
  specifier === '.' ||
  specifier === '..' ||
  specifier.startsWith('./') ||
  specifier.startsWith('../');

/**
 * The file `specifier`, written in `from`, names, or `undefined` when it
 * is not relative or names no file `exists` knows. `from` is absolute or
 * relative to a root, and so is the answer.
 */
export const resolveRelative = (
  from: string,
  specifier: string,
  exists: (path: string) => boolean,
): string | undefined => {
  if (!isRelative(specifier)) return undefined;
  const joined = posix.normalize(posix.join(parentOf(from), specifier));
  const base = joined === '.' ? '' : joined.replace(/\/$/, '');
  if (base === '..' || base.startsWith('../')) return undefined;
  const extension = sourceExtensions.find((ext) => base.endsWith(ext));
  const candidates = [
    ...(extension
      ? (compiledToSource[extension] ?? [extension]).map(
          (ext) => base.slice(0, -extension.length) + ext,
        )
      : sourceExtensions.map((ext) => base + ext)),
    ...indexFiles.map((file) => joinPath(base, file)),
  ];
  return candidates.find(exists);
};
