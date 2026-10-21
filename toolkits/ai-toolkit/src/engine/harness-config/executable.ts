import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Effect } from 'effect';

/** A path as the user wrote it, `~` expanded, made absolute. */
export const expand = (path: string) =>
  resolve(
    path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path,
  );

/** Why `path` cannot be run, or null when it is a file this user may run. */
export const whyNotExecutable = (path: string) =>
  Effect.promise(async () => {
    const found = await stat(path).catch(() => null);
    if (found === null) return `Nothing is at ${path}`;
    if (!found.isFile()) return `${path} is not a file`;
    const runs = await access(path, constants.X_OK).then(
      () => true,
      () => false,
    );
    return runs ? null : `${path} is not executable`;
  });
