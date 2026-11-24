import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

/*
 * The folder tree as both rules read it. A module is a folder with an
 * index file. A file belongs to the nearest module above it, or, when
 * there is none, to its package as a whole.
 */

const INDEX_FILES = [
  'index.ts',
  'index.tsx',
  'index.mts',
  'index.js',
  'index.jsx',
  'index.mjs',
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

/** A `.js` in an import names the `.ts` beside it, as TypeScript writes it. */
const COMPILED_TO_SOURCE: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
};

const modules = new Map<string, boolean>();
const packages = new Map<string, string>();

/** Whether the folder is a module: it holds an index file. */
export const isModule = (dir: string): boolean => {
  let known = modules.get(dir);
  if (known === undefined) {
    known = INDEX_FILES.some((file) => existsSync(join(dir, file)));
    modules.set(dir, known);
  }
  return known;
};

/** Whether the file is a module's index file. */
export const isIndexFile = (file: string): boolean =>
  INDEX_FILES.includes(basename(file));

/** The nearest folder at or above `dir` holding a `package.json`. */
export const packageOf = (dir: string): string => {
  const known = packages.get(dir);
  if (known !== undefined) return known;
  const parent = dirname(dir);
  const found =
    existsSync(join(dir, 'package.json')) || parent === dir
      ? dir
      : packageOf(parent);
  packages.set(dir, found);
  return found;
};

/** The module a folder belongs to: the nearest module at or above it, or its package. */
export const moduleOf = (dir: string, root: string): string => {
  for (let at = dir; isInside(at, root) || at === root; at = dirname(at)) {
    if (at === root || isModule(at)) return at;
  }
  return root;
};

/** Whether `path` sits strictly inside `dir`. */
export const isInside = (path: string, dir: string): boolean =>
  path.startsWith(dir + sep);

/** The file a relative import names, or `undefined` for a package or a file that is not there. */
export const resolveImport = (
  from: string,
  specifier: string,
): string | undefined => {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(from), specifier);
  const extension = SOURCE_EXTENSIONS.find((ext) => base.endsWith(ext));
  const stem = extension ? base.slice(0, -extension.length) : base;
  const candidates = [
    ...(extension
      ? (COMPILED_TO_SOURCE[extension] ?? [extension]).map((ext) => stem + ext)
      : SOURCE_EXTENSIONS.map((ext) => base + ext)),
    ...INDEX_FILES.map((file) => join(base, file)),
  ];
  return candidates.find((file) => existsSync(file));
};

/**
 * The folder that owns `dir` through `pattern`, when `dir` ends in it:
 * `a/actor-tree/logic/shared` through `logic/shared` is owned by
 * `a/actor-tree`. A `*` matches one folder name.
 */
export const ownerThrough = (
  dir: string,
  pattern: string,
): string | undefined => {
  const parts = dir.split(sep);
  const wanted = pattern.split('/');
  if (parts.length <= wanted.length) return undefined;
  const tail = parts.slice(-wanted.length);
  const matches = wanted.every((part, i) => part === '*' || part === tail[i]);
  return matches ? parts.slice(0, -wanted.length).join(sep) : undefined;
};

/** The folder at or above `dir` that ends in `pattern`, with its owner. */
export const enclosing = (
  dir: string,
  pattern: string,
  root: string,
): { readonly folder: string; readonly owner: string } | undefined => {
  for (let at = dir; isInside(at, root); at = dirname(at)) {
    const owner = ownerThrough(at, pattern);
    if (owner !== undefined && (owner === root || isInside(owner, root)))
      return { folder: at, owner };
  }
  return undefined;
};
