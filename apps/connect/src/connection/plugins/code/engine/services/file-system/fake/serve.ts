import { Effect, Layer } from 'effect';
import type { LiveInstance, Sent } from '@kestack/kabuki/types';
import {
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
import { childrenOf, resolve, type Entry, type Tree } from './tree.js';

/*
 * The File System key over a fake File System's Model. It reads the tree
 * as it is at each call, answers as `node.ts` would on a disk like it, and
 * picks the same errors: nothing there, or a file on the way, NotFound; a
 * folder there already, AlreadyExists; a folder read, written or removed
 * as a file, IoError. A change it would make is a Message, Sent only once nothing is in the
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
        const at = yield* found(tree(), path);
        if (at.entry._tag !== 'Folder') return yield* new NotFound({ path });
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
        const { entry } = yield* found(tree(), path);
        return { kind: entry._tag === 'Folder' ? 'folder' : 'file' } as const;
      }),
    realpath: (path) =>
      Effect.map(
        Effect.suspend(() => found(tree(), path)),
        (at) => at.path,
      ),
    mkdir: (path, options) =>
      Effect.gen(function* () {
        const now = tree();
        if (!options?.recursive) {
          const at = resolve(now, path);
          if (at._tag === 'Found') return yield* new AlreadyExists({ path });
          if (at._tag !== 'Missing') return yield* new NotFound({ path });
          return yield* change(path, { _tag: 'FolderMade', path: at.path });
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
          return yield* change(path, {
            _tag: 'FolderMade',
            path: join(at.path, ...parts.slice(depth)),
          });
        }
        return yield* new NotFound({ path });
      }),
    readFile: (path) =>
      Effect.gen(function* () {
        const { entry } = yield* found(tree(), path);
        if (entry._tag !== 'File')
          return yield* new IoError({
            path,
            message: 'EISDIR: illegal operation on a directory, read',
          });
        return bytesOf(entry);
      }),
    writeFile: (path, data) =>
      Effect.gen(function* () {
        const at = resolve(tree(), path);
        if (at._tag === 'Found' && at.entry._tag === 'Folder')
          return yield* new IoError({
            path,
            message: `EISDIR: illegal operation on a directory, open '${path}'`,
          });
        if (at._tag === 'NotFound') return yield* new NotFound({ path });
        yield* change(path, {
          _tag: 'FileWritten',
          path: at.path,
          ...keptOf(data),
        });
      }),
    remove: (path, options) =>
      Effect.gen(function* () {
        const at = resolve(tree(), path);
        if (at._tag !== 'Found') {
          if (options?.force) return;
          return yield* new NotFound({ path });
        }
        if (at.entry._tag === 'Folder' && !options?.recursive)
          return yield* new IoError({
            path,
            message: `Path is a directory: rm returned EISDIR (is a directory) ${path}`,
          });
        yield* change(path, { _tag: 'PathRemoved', path: at.path });
      }),
  };
  return Layer.succeed(FileSystem, service);
};
