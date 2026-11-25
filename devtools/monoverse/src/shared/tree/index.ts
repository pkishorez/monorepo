import { posix } from 'node:path';

export interface Tree {
  readonly isModule: (dir: string) => boolean;
  readonly packageOf: (dir: string) => string;
}

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

export const isIndexFile = (file: string): boolean =>
  (indexFiles as readonly string[]).includes(posix.basename(file));

export const parentOf = (path: string): string => {
  const parent = posix.dirname(path);
  return parent === '.' ? '' : parent;
};

export const joinPath = (dir: string, name: string): string =>
  dir === '' ? name : posix.join(dir, name);

export const relativeTo = (dir: string, path: string): string =>
  dir === '' ? path : path === dir ? '' : path.slice(dir.length + 1);

export const isInside = (path: string, dir: string): boolean => {
  if (dir === '') return path !== '' && !path.startsWith('/');
  return path.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
};

const isAtOrInside = (path: string, dir: string): boolean =>
  path === dir || isInside(path, dir);

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

export const moduleOf = (tree: Tree, dir: string, root: string): string => {
  for (let at = dir; isInside(at, root); at = parentOf(at))
    if (tree.isModule(at)) return at;
  return root;
};

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
