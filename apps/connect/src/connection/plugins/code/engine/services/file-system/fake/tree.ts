import { Schema } from 'effect';
import { dirname, join, normalize, partsOf, isWithin } from './paths.js';

/*
 * The fake's tree, as plain data: every entry by its absolute path, `/`
 * included. A folder may be unreadable (as `chmod 000`: neither listed
 * nor gone into), failing (listing it is an I/O error) or slow (listing it
 * takes longer than anyone waits); a file holds its
 * text, or its bytes as base64; a symlink holds its target, absolute or
 * from its own folder. Hidden is only a name starting with `.`. Every
 * function here is pure: the Actor's Updates change the tree with them,
 * and the layer reads it with `resolve`.
 */

/** How a file's data is kept: `utf8` for text as it is, `base64` for other bytes. */
export const Encoding = Schema.Literals(['utf8', 'base64']);

export const Entry = Schema.TaggedUnion({
  Folder: {
    /** This user may not list it, nor reach anything in it. */
    unreadable: Schema.Boolean,
    /** Listing it fails, as a disk failing would. */
    failing: Schema.Boolean,
    /** Listing it takes long, as a slow disk or a network folder would. */
    slow: Schema.Boolean,
  },
  File: {
    data: Schema.String,
    encoding: Encoding,
  },
  Symlink: { target: Schema.String },
});
export type Entry = typeof Entry.Type;

export const Tree = Schema.Record(Schema.String, Entry);
export type Tree = typeof Tree.Type;

export const folder: Entry = {
  _tag: 'Folder',
  unreadable: false,
  failing: false,
  slow: false,
};

export const textFile = (data: string): Entry => ({
  _tag: 'File',
  data,
  encoding: 'utf8',
});

/** A tree holding only `path` and the folders on the way to it. */
export const treeWith = (path: string): Tree => ensureFolders({}, path);

/**
 * `tree` with a folder at `path` and at every path on the way; what is
 * there already stays, and a file or symlink on the way is replaced.
 */
export const ensureFolders = (tree: Tree, path: string): Tree => {
  const next: Record<string, Entry> = { ...tree };
  let at = '/';
  if (next[at]?._tag !== 'Folder') next[at] = folder;
  for (const part of partsOf(path)) {
    at = join(at, part);
    if (next[at]?._tag !== 'Folder') next[at] = folder;
  }
  return next;
};

/** `tree` with `entry` at `path`, the folders on the way made. */
export const put = (tree: Tree, path: string, entry: Entry): Tree => {
  const normal = normalize(path);
  if (normal === '/') return tree;
  const without = remove(tree, normal);
  return { ...ensureFolders(without, dirname(normal)), [normal]: entry };
};

/** What is at `path` and below it. */
export const subtree = (tree: Tree, path: string): Tree =>
  Object.fromEntries(Object.entries(tree).filter(([at]) => isWithin(path, at)));

/** `tree` without `path` and all below it; `/` always stays. */
export const remove = (tree: Tree, path: string): Tree => {
  const normal = normalize(path);
  const next = Object.fromEntries(
    Object.entries(tree).filter(([at]) => !isWithin(normal, at)),
  );
  return normal === '/' ? { '/': folder } : next;
};

/** `tree` with the folder at `path` changed, if one is there. */
export const changeFolder = (
  tree: Tree,
  path: string,
  change: {
    readonly unreadable?: boolean;
    readonly failing?: boolean;
    readonly slow?: boolean;
  },
): Tree => {
  const normal = normalize(path);
  const found = tree[normal];
  if (found?._tag !== 'Folder') return tree;
  return { ...tree, [normal]: { ...found, ...change } };
};

/** The entries right inside the folder `path`, by name. */
export const childrenOf = (tree: Tree, path: string) => {
  const prefix = path === '/' ? '/' : `${path}/`;
  return Object.entries(tree)
    .filter(
      ([at]) =>
        at !== path &&
        at.startsWith(prefix) &&
        !at.includes('/', prefix.length),
    )
    .map(([at, entry]) => ({ name: at.slice(prefix.length), entry }));
};

/** How many symlinks one path may pass through, as Linux allows. */
const MOST_LINKS = 40;

/**
 * Where a path leads, as the kernel walks it: each folder on the way must
 * be readable to go into, a symlink on the way is followed, and the last
 * one only when `follow`. `Found` is the entry and its real path; `Missing`
 * is a path whose folder is there but holds nothing of its name, the real
 * path a new entry would take.
 */
export type Resolved =
  | { readonly _tag: 'Found'; readonly path: string; readonly entry: Entry }
  | { readonly _tag: 'Missing'; readonly path: string }
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'AccessDenied' }
  | { readonly _tag: 'Loop' };

export const resolve = (
  tree: Tree,
  path: string,
  follow: boolean,
  links = 0,
): Resolved => {
  const parts = partsOf(path);
  let at = '/';
  for (const [index, part] of parts.entries()) {
    const here = tree[at];
    if (here?._tag !== 'Folder') return { _tag: 'NotFound' };
    if (here.unreadable) return { _tag: 'AccessDenied' };
    const next = join(at, part);
    const found = tree[next];
    const last = index === parts.length - 1;
    if (found === undefined)
      return last ? { _tag: 'Missing', path: next } : { _tag: 'NotFound' };
    if (found._tag === 'Symlink' && (follow || !last)) {
      if (links >= MOST_LINKS) return { _tag: 'Loop' };
      const to = found.target.startsWith('/')
        ? found.target
        : join(at, found.target);
      const target = resolve(tree, to, true, links + 1);
      if (last) return target;
      if (target._tag === 'Missing') return { _tag: 'NotFound' };
      if (target._tag !== 'Found') return target;
      if (target.entry._tag !== 'Folder') return { _tag: 'NotFound' };
      at = target.path;
      continue;
    }
    if (last) return { _tag: 'Found', path: next, entry: found };
    if (found._tag !== 'Folder') return { _tag: 'NotFound' };
    at = next;
  }
  const root = tree['/'] ?? folder;
  return { _tag: 'Found', path: '/', entry: root };
};
