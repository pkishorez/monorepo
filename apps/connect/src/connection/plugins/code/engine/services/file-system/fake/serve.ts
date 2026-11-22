import { Duration, Effect, Layer } from 'effect';
import type { LiveInstance, Sent } from '@kestack/kabuki/types';
import {
  AccessDenied,
  AlreadyExists,
  FileSystem,
  IoError,
  NotFound,
  type DirEntry,
  type EntryKind,
} from '../../../capabilities/index.js';
import type {
  FileSystemFake,
  FileSystemMessage,
  FileSystemModel,
} from './actor.js';
import { join, partsOf } from './paths.js';
import {
  childrenOf,
  resolve,
  subtree,
  type Entry,
  type Resolved,
  type Tree,
} from './tree.js';

/*
 * The File System key over a fake File System's Model. It reads the tree
 * as it is at each call, answers as `node.ts` would on a disk like it, and
 * picks the same errors: nothing there, or a file on the way, NotFound; an
 * unreadable folder listed or gone into, AccessDenied; a folder that fails
 * to list, a folder read or removed as a file, or a symlink loop, IoError;
 * a slow folder lists only after `SLOW`, longer than anyone waits.
 * A change it would make is a Message, Sent only once nothing is in the
 * way, so it lands as asked. The handle is all it holds of the fake: a
 * running Fake's root, or a computer's File System inside another Fake.
 */

/** What the layer holds of a fake File System: its Model now, and a way to change it. */
export interface FileSystemHandle {
  readonly read: () => FileSystemModel;
  readonly send: (message: FileSystemMessage) => Sent;
}

/** The handle of a live fake File System. */
export const handleOf = (
  instance: LiveInstance<typeof FileSystemFake>,
): FileSystemHandle => ({
  read: () => instance.model,
  send: (message) => instance.send(message),
});

const kindOf = (entry: Entry): EntryKind =>
  entry._tag === 'Folder'
    ? 'folder'
    : entry._tag === 'File'
      ? 'file'
      : 'symlink';

/** How long listing a slow folder takes. */
export const SLOW = Duration.seconds(30);

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

type Failure = NotFound | AccessDenied | IoError;

/** Why a walk to `path` stopped, as the key says it. */
const failureOf = (path: string, found: Resolved, call: string): Failure => {
  switch (found._tag) {
    case 'AccessDenied':
      return new AccessDenied({ path });
    case 'Loop':
      return new IoError({
        path,
        message: `ELOOP: too many symbolic links encountered, ${call} '${path}'`,
      });
    default:
      return new NotFound({ path });
  }
};

/** What a call reads, found with its symlinks followed. */
const found = (
  tree: Tree,
  path: string,
  call: string,
): Effect.Effect<Extract<Resolved, { _tag: 'Found' }>, Failure> => {
  const at = resolve(tree, path, true);
  return at._tag === 'Found'
    ? Effect.succeed(at)
    : Effect.fail(failureOf(path, at, call));
};

/**
 * Whether removing `path` and all in it meets a folder it may not list: an
 * unreadable one with anything in it.
 */
const lockedIn = (tree: Tree, path: string) =>
  Object.entries(subtree(tree, path)).some(
    ([at, entry]) =>
      entry._tag === 'Folder' &&
      entry.unreadable &&
      childrenOf(tree, at).length > 0,
  );

/** The File System of a fake computer, as its handle shows it. */
export const fileSystemOver = (
  handle: FileSystemHandle,
): Layer.Layer<FileSystem> => {
  const tree = () => handle.read().tree;

  /** Sends a change; one the fake did not take is an IoError. */
  const change = (path: string, message: FileSystemMessage) =>
    Effect.suspend(() =>
      handle.send(message) === 'refused'
        ? Effect.fail(
            new IoError({ path, message: 'The fake File System is stopped' }),
          )
        : Effect.void,
    );

  const service: FileSystem['Service'] = {
    home: handle.read().home,
    list: (path) =>
      Effect.gen(function* () {
        const at = yield* found(tree(), path, 'scandir');
        const entry = at.entry;
        if (entry._tag !== 'Folder') return yield* new NotFound({ path });
        if (entry.unreadable) return yield* new AccessDenied({ path });
        if (entry.failing)
          return yield* new IoError({
            path,
            message: `EIO: i/o error, scandir '${path}'`,
          });
        if (entry.slow) yield* Effect.sleep(SLOW);
        return childrenOf(tree(), at.path)
          .map(({ name, entry: child }): DirEntry => ({
            name,
            kind: kindOf(child),
            hidden: name.startsWith('.'),
          }))
          .sort(byName);
      }),
    stat: (path) =>
      Effect.gen(function* () {
        const { entry } = yield* found(tree(), path, 'stat');
        return { kind: entry._tag === 'Folder' ? 'folder' : 'file' } as const;
      }),
    realpath: (path) =>
      Effect.map(
        Effect.suspend(() => found(tree(), path, 'realpath')),
        (at) => at.path,
      ),
    mkdir: (path, options) =>
      Effect.gen(function* () {
        const now = tree();
        if (!options?.recursive) {
          const at = resolve(now, path, false);
          if (at._tag === 'Found') return yield* new AlreadyExists({ path });
          if (at._tag !== 'Missing') return yield* failureOf(path, at, 'mkdir');
          return yield* change(path, { _tag: 'FolderMade', path: at.path });
        }
        // The deepest folder there on the way; every folder after it is new.
        const parts = partsOf(path);
        for (let depth = parts.length; depth >= 0; depth--) {
          const at = resolve(now, join('/', ...parts.slice(0, depth)), true);
          if (at._tag === 'Missing' || at._tag === 'NotFound') continue;
          if (at._tag !== 'Found') return yield* failureOf(path, at, 'mkdir');
          const whole = depth === parts.length;
          if (at.entry._tag !== 'Folder')
            return yield* whole
              ? new AlreadyExists({ path })
              : new NotFound({ path });
          if (whole) return;
          if (at.entry.unreadable) return yield* new AccessDenied({ path });
          return yield* change(path, {
            _tag: 'FolderMade',
            path: join(at.path, ...parts.slice(depth)),
          });
        }
        return yield* new NotFound({ path });
      }),
    readFile: (path) =>
      Effect.gen(function* () {
        const { entry } = yield* found(tree(), path, 'open');
        if (entry._tag !== 'File')
          return yield* new IoError({
            path,
            message: 'EISDIR: illegal operation on a directory, read',
          });
        return bytesOf(entry);
      }),
    writeFile: (path, data) =>
      Effect.gen(function* () {
        const at = resolve(tree(), path, true);
        if (at._tag === 'Found' && at.entry._tag === 'Folder')
          return yield* new IoError({
            path,
            message: `EISDIR: illegal operation on a directory, open '${path}'`,
          });
        if (at._tag !== 'Found' && at._tag !== 'Missing')
          return yield* failureOf(path, at, 'open');
        yield* change(path, {
          _tag: 'FileWritten',
          path: at.path,
          ...keptOf(data),
        });
      }),
    remove: (path, options) =>
      Effect.gen(function* () {
        const now = tree();
        const at = resolve(now, path, false);
        if (at._tag === 'Missing' || at._tag === 'NotFound') {
          if (options?.force) return;
          return yield* new NotFound({ path });
        }
        if (at._tag !== 'Found') return yield* failureOf(path, at, 'rm');
        if (at.entry._tag === 'Folder') {
          if (!options?.recursive)
            return yield* new IoError({
              path,
              message: `Path is a directory: rm returned EISDIR (is a directory) ${path}`,
            });
          if (lockedIn(now, at.path)) return yield* new AccessDenied({ path });
        }
        yield* change(path, { _tag: 'PathRemoved', path: at.path });
      }),
  };
  return Layer.succeed(FileSystem, service);
};
