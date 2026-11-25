import { Effect, Layer, SubscriptionRef } from 'effect';
import {
  AlreadyExists,
  FileSystem,
  IoError,
  NotFound,
  type DirEntry,
  type EntryKind,
} from '../../../capabilities/index.js';
import type { DiskChange, FileSystemState } from './fake.js';
import { join, partsOf } from './paths.js';
import {
  childrenOf,
  ensureFolders,
  put,
  remove,
  resolve,
  type Entry,
  type Tree,
} from './tree.js';

/*
 * The File System key over a fake disk. It reads the tree as it is at each
 * call, answers as `node.ts` would on a disk like it, and picks the same
 * errors: nothing there, or a file on the way, NotFound; a folder there
 * already, AlreadyExists; a folder read, written or removed as a file,
 * IoError. A change is made only once nothing is in the way, so it lands
 * as asked; one the keeper refuses, a computer gone, is an IoError. The
 * `Disk` is all it holds of the fake: a test's own state, or a computer's
 * disk inside the Computers fake.
 */

/** Where a fake disk is kept: it as it is now, and a way to change it, or why not. */
export interface Disk {
  readonly read: Effect.Effect<FileSystemState>;
  readonly update: (change: DiskChange) => Effect.Effect<void, string>;
}

/** A disk kept in a state of its own. */
export const diskOf = (
  state: SubscriptionRef.SubscriptionRef<FileSystemState>,
): Disk => ({
  read: SubscriptionRef.get(state),
  update: (change) => SubscriptionRef.update(state, change),
});

const kindOf = (entry: Entry): EntryKind =>
  entry._tag === 'Folder' ? 'folder' : 'file';

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const bytesOf = (entry: Extract<Entry, { _tag: 'File' }>) =>
  entry.encoding === 'utf8'
    ? encoder.encode(entry.data)
    : Uint8Array.from(atob(entry.data), (char) => char.charCodeAt(0));

/** Data as the tree keeps it: text when it is UTF-8, else base64. */
const keptOf = (data: Uint8Array | string) => {
  if (typeof data === 'string') return { data, encoding: 'utf8' as const };
  try {
    return { data: decoder.decode(data), encoding: 'utf8' as const };
  } catch {
    let binary = '';
    for (const byte of data) binary += String.fromCharCode(byte);
    return { data: btoa(binary), encoding: 'base64' as const };
  }
};

/** What a call reads; NotFound when nothing is there. */
const found = (tree: Tree, path: string) => {
  const at = resolve(tree, path);
  return at._tag === 'Found'
    ? Effect.succeed(at)
    : Effect.fail(new NotFound({ path }));
};

/** The File System of a fake computer, over its disk. */
export const fileSystemOver = (disk: Disk): Layer.Layer<FileSystem> =>
  Layer.effect(
    FileSystem,
    Effect.map(disk.read, ({ home }) => serviceOf(disk, home)),
  );

const serviceOf = (disk: Disk, home: string): FileSystem['Service'] => {
  const read = Effect.map(disk.read, ({ tree }) => tree);

  /** Changes the tree; one the keeper refuses is an IoError. */
  const change = (path: string, next: (tree: Tree) => Tree) =>
    Effect.mapError(
      disk.update((now) => ({ ...now, tree: next(now.tree) })),
      (message) => new IoError({ path, message }),
    );

  return {
    home,
    list: (path) =>
      Effect.gen(function* () {
        const tree = yield* read;
        const at = yield* found(tree, path);
        if (at.entry._tag !== 'Folder') return yield* new NotFound({ path });
        return childrenOf(tree, at.path)
          .map(({ name, entry: child }): DirEntry => ({
            name,
            kind: kindOf(child),
            hidden: name.startsWith('.'),
          }))
          .sort(byName);
      }),
    stat: (path) =>
      Effect.gen(function* () {
        const { entry } = yield* found(yield* read, path);
        return { kind: entry._tag === 'Folder' ? 'folder' : 'file' } as const;
      }),
    realpath: (path) =>
      Effect.map(
        Effect.flatMap(read, (tree) => found(tree, path)),
        (at) => at.path,
      ),
    mkdir: (path, options) =>
      Effect.gen(function* () {
        const now = yield* read;
        if (!options?.recursive) {
          const at = resolve(now, path);
          if (at._tag === 'Found') return yield* new AlreadyExists({ path });
          if (at._tag !== 'Missing') return yield* new NotFound({ path });
          return yield* change(path, (tree) => ensureFolders(tree, at.path));
        }
        // The deepest folder there on the way; every folder after it is new.
        const parts = partsOf(path);
        for (let depth = parts.length; depth >= 0; depth--) {
          const at = resolve(now, join('/', ...parts.slice(0, depth)));
          if (at._tag !== 'Found') continue;
          const whole = depth === parts.length;
          if (at.entry._tag !== 'Folder')
            return yield* whole
              ? new AlreadyExists({ path })
              : new NotFound({ path });
          if (whole) return;
          const made = join(at.path, ...parts.slice(depth));
          return yield* change(path, (tree) => ensureFolders(tree, made));
        }
        return yield* new NotFound({ path });
      }),
    readFile: (path) =>
      Effect.gen(function* () {
        const { entry } = yield* found(yield* read, path);
        if (entry._tag !== 'File')
          return yield* new IoError({
            path,
            message: 'EISDIR: illegal operation on a directory, read',
          });
        return bytesOf(entry);
      }),
    writeFile: (path, data) =>
      Effect.gen(function* () {
        const at = resolve(yield* read, path);
        if (at._tag === 'Found' && at.entry._tag === 'Folder')
          return yield* new IoError({
            path,
            message: `EISDIR: illegal operation on a directory, open '${path}'`,
          });
        if (at._tag === 'NotFound') return yield* new NotFound({ path });
        const file: Entry = { _tag: 'File', ...keptOf(data) };
        yield* change(path, (tree) => put(tree, at.path, file));
      }),
    remove: (path, options) =>
      Effect.gen(function* () {
        const at = resolve(yield* read, path);
        if (at._tag !== 'Found') {
          if (options?.force) return;
          return yield* new NotFound({ path });
        }
        if (at.entry._tag === 'Folder' && !options?.recursive)
          return yield* new IoError({
            path,
            message: `Path is a directory: rm returned EISDIR (is a directory) ${path}`,
          });
        yield* change(path, (tree) => remove(tree, at.path));
      }),
  };
};
