import {
  closeSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { pidAlive } from './leases.js';

/*
 * One dev process at a time decides whether this branch's Connect must be
 * started: a lock file made with `open(…, 'wx')`, holding `{ pid, at }`.
 * A lock whose pid is dead, or older than a minute, is stale: it is
 * removed and taken again.
 */

interface Held {
  readonly pid: number;
  readonly at: number;
}

export interface LockOptions {
  /** A lock older than this is stale; 60 s. */
  readonly staleMs?: number;
  /** How often to try again; 100 ms. */
  readonly retryMs?: number;
  /** How long to keep trying before failing; 30 s. */
  readonly timeoutMs?: number;
}

const lockFile = (dir: string) => join(dir, 'lock');

/** Who holds the lock at `file`, and since when; undefined when it cannot be read. */
const heldAt = (file: string): Held | undefined => {
  try {
    const held = JSON.parse(readFileSync(file, 'utf8')) as Partial<Held>;
    if (typeof held.pid === 'number' && typeof held.at === 'number')
      return { pid: held.pid, at: held.at };
  } catch {
    // Missing, or written half; its age below decides.
  }
  return undefined;
};

/** Whether the lock at `file` was left by a dead process or long ago. */
const stale = (file: string, staleMs: number): boolean => {
  const held = heldAt(file);
  if (held !== undefined)
    return !pidAlive(held.pid) || Date.now() - held.at > staleMs;
  try {
    return Date.now() - statSync(file).mtimeMs > staleMs;
  } catch {
    return true;
  }
};

/** Takes the lock if it is free; true when taken. */
const tryTake = (file: string): boolean => {
  try {
    const fd = openSync(file, 'wx', 0o600);
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
};

/** Removes the lock, if it is still this process's. */
const giveBack = (file: string) => {
  if (heldAt(file)?.pid !== process.pid) return;
  try {
    unlinkSync(file);
  } catch {
    // Already gone.
  }
};

/** Runs `fn` holding the lock in `dir`, taking over a stale one; fails after `timeoutMs`. */
export const withLock = async <A>(
  dir: string,
  fn: () => Promise<A>,
  options: LockOptions = {},
): Promise<A> => {
  const { staleMs = 60_000, retryMs = 100, timeoutMs = 30_000 } = options;
  const file = lockFile(dir);
  const until = Date.now() + timeoutMs;
  while (!tryTake(file)) {
    if (stale(file, staleMs)) {
      try {
        unlinkSync(file);
      } catch {
        // Another process took it over first.
      }
      continue;
    }
    if (Date.now() > until)
      throw new Error(
        `Could not take ${file} within ${timeoutMs / 1000} s; is another dev starting? Delete it if not.`,
      );
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  try {
    return await fn();
  } finally {
    giveBack(file);
  }
};
