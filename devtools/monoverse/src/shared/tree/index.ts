import { posix } from 'node:path';

/*
 * The folder tree as the rules read it. A module is a folder with an
 * index file. A package is a folder with a `package.json`; every path
 * belongs to the nearest one above it.
 *
 * Paths are posix and relative to the project root, `/` between folders,
 * where `''` is the root itself. The rules never touch the disk: they
 * ask a Tree.
 */

/** What the rules need to know about the folders around a file. */
export interface Tree {
  /** Whether the folder holds an index file. */
  readonly isModule: (dir: string) => boolean;
  /** The nearest folder at or above `dir` holding a `package.json`, or `''`. */
  readonly packageOf: (dir: string) => string;
}

/** The file names that make a folder a module. */
export const indexFiles = [
  'index.ts',
  'index.tsx',
  'index.mts',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cts',
  'index.cjs',
] as const;

/** Whether the file is a module's index file. */
export const isIndexFile = (file: string): boolean =>
  (indexFiles as readonly string[]).includes(posix.basename(file));

/** The folder holding `path`: `''` for a path at the root. */
export const parentOf = (path: string): string => {
  const parent = posix.dirname(path);
  return parent === '.' ? '' : parent;
};

/** `name` inside `dir`, where `''` is the root. */
export const joinPath = (dir: string, name: string): string =>
  dir === '' ? name : posix.join(dir, name);

/** `path` as seen from `dir`, which holds it or is it. */
export const relativeTo = (dir: string, path: string): string =>
  dir === '' ? path : path === dir ? '' : path.slice(dir.length + 1);

/** Whether `path` sits strictly inside `dir`. */
export const isInside = (path: string, dir: string): boolean => {
  if (dir === '') return path !== '' && !path.startsWith('/');
  return path.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
};

/** `path` itself or anything inside it. */
const isAtOrInside = (path: string, dir: string): boolean =>
  path === dir || isInside(path, dir);

/**
 * A Tree over a list of files relative to one root, such as the ones git
 * knows. A folder is a module when the list holds its index file, and a
 * package when it holds its `package.json`.
 */
export const listTree = (files: Iterable<string>): Tree => {
  const modules = new Set<string>();
  const packages = new Set<string>();
  for (const file of files) {
    const dir = parentOf(file);
    const name = posix.basename(file);
    if (name === 'package.json') packages.add(dir);
    else if (isIndexFile(name)) modules.add(dir);
  }
  return {
    isModule: (dir) => modules.has(dir),
    packageOf: (dir) => {
      for (let at = dir; ; at = parentOf(at))
        if (packages.has(at) || at === '') return at;
    },
  };
};

/** The module a folder belongs to: the nearest module at or above it, or its package. */
export const moduleOf = (tree: Tree, dir: string, root: string): string => {
  for (let at = dir; isInside(at, root); at = parentOf(at))
    if (tree.isModule(at)) return at;
  return root;
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
  const parts = dir === '' ? [] : dir.split('/');
  const wanted = pattern.split('/');
  if (parts.length < wanted.length) return undefined;
  const tail = parts.slice(parts.length - wanted.length);
  const matches = wanted.every((part, i) => part === '*' || part === tail[i]);
  return matches
    ? parts.slice(0, parts.length - wanted.length).join('/')
    : undefined;
};

/** The folder at or above `dir`, inside `root`, that ends in `pattern`, with its owner. */
export const enclosing = (
  dir: string,
  pattern: string,
  root: string,
): { readonly folder: string; readonly owner: string } | undefined => {
  for (let at = dir; isInside(at, root); at = parentOf(at)) {
    const owner = ownerThrough(at, pattern);
    if (owner !== undefined && isAtOrInside(owner, root))
      return { folder: at, owner };
  }
  return undefined;
};
