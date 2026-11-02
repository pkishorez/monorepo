import { open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { Effect } from 'effect';
import {
  extensionOf,
  FileMissing,
  type FileTicket,
  fileTypeOf,
  FileUnreadable,
  NotAFile,
  type RequestFilePayload,
  ticketPath,
  UnsupportedFile,
} from '../api/contract/index.js';
import { Tickets } from './tickets.js';

/*
 * `requestFile`: the path resolved, a leading `~` as the home folder and a
 * relative one from `base`, which must be absolute; then its symlinks
 * followed. Its kind comes from the extension of the file it really is,
 * never the one asked for, so `x.png` symlinked to a key is Unsupported.
 * A hard link is not caught: it is a name of the file's own, so a key
 * hard-linked as `x.png` is shown as an image, but making that link takes
 * access to the key already. A file that can be opened for reading gets a
 * File Ticket, bound to its device and inode as they are now.
 */

/** The code of a failed file system call, if it has one. */
const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** `path` with a leading `~` as `home`. */
const expanded = (path: string, home: string) =>
  path === '~'
    ? home
    : path.startsWith('~/') || path.startsWith('~\\')
      ? join(home, path.slice(2))
      : path;

/**
 * The absolute path `path` names, read from `base` when relative; null when
 * it is relative and `base` is not absolute.
 */
export const resolvePath = (
  home: string,
  { base, path }: RequestFilePayload,
): string | null => {
  const asked = expanded(path, home);
  if (isAbsolute(asked)) return resolve(asked);
  const from = expanded(base, home);
  return isAbsolute(from) ? resolve(from, asked) : null;
};

/** A failed file system call at `path` as why it has no ticket: missing when nothing is there, else unreadable. */
const failure = (path: string) => (error: unknown) =>
  codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR'
    ? new FileMissing({ path })
    : new FileUnreadable({ path, message: messageOf(error) });

/** A File Ticket to the file at `path`, read from `base` when relative and from `home` after a `~`; or why there is none. */
export const requestFile = (home: string) => (payload: RequestFilePayload) =>
  Effect.gen(function* () {
    const asked = resolvePath(home, payload);
    if (asked === null)
      return yield* new FileUnreadable({
        path: payload.path,
        message: `A relative path is read from an absolute folder, not ${payload.base}`,
      });
    const path = yield* Effect.tryPromise({
      try: () => realpath(asked),
      catch: failure(asked),
    });
    const stats = yield* Effect.tryPromise({
      try: () => stat(path),
      catch: failure(path),
    });
    if (!stats.isFile()) return yield* new NotAFile({ path });
    const type = fileTypeOf(path);
    if (type === null)
      return yield* new UnsupportedFile({ path, extension: extensionOf(path) });
    const opened = yield* Effect.tryPromise({
      try: async () => {
        const handle = await open(path, 'r');
        try {
          return await handle.stat();
        } finally {
          await handle.close();
        }
      },
      catch: failure(path),
    });
    const name = basename(path);
    const { token, expiresAt } = yield* (yield* Tickets).give({
      realPath: path,
      dev: opened.dev,
      ino: opened.ino,
      name,
      kind: type.kind,
      mime: type.mime,
    });
    const ticket: FileTicket = {
      path,
      name,
      kind: type.kind,
      mime: type.mime,
      size: opened.size,
      url: ticketPath(token, name),
      expiresAt,
    };
    return ticket;
  });
