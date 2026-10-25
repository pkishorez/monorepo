import { randomUUID } from 'node:crypto';
import {
  closeSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
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
 * renamed aside, which only one process can do, and taken again.
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

/** What the lock at `file` says; undefined when it is missing. */
const contentOf = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** Who holds a lock saying `text`, and since when; undefined when it does not read. */
const heldIn = (text: string | undefined): Held | undefined => {
  try {
    const held = JSON.parse(text ?? '') as Partial<Held>;
    if (typeof held.pid === 'number' && typeof held.at === 'number')
      return { pid: held.pid, at: held.at };
  } catch {
    // Missing, or written half; its age decides.
  }
  return undefined;
};

/** Whether the lock at `file`, saying `text`, was left by a dead process or long ago. */
const stale = (file: string, text: string, staleMs: number): boolean => {
  const held = heldIn(text);
  if (held !== undefined)
    return !pidAlive(held.pid) || Date.now() - held.at > staleMs;
  try {
    return Date.now() - statSync(file).mtimeMs > staleMs;
  } catch {
    return true;
  }
};

/**
 * Removes the stale lock at `file`, judged so while it said `seen`. It is
 * renamed aside first, so of two processes taking it over only one moves
 * it; one that moved a fresh lock instead, taken since, puts it back.
 */
export const takeOver = (file: string, seen: string) => {
  const aside = `${file}.${process.pid}.${randomUUID()}.stale`;
  try {
    renameSync(file, aside);
  } catch {
    // Another process moved it first.
    return;
  }
  if (contentOf(aside) !== seen) {
    try {
      linkSync(aside, file);
    } catch {
      // Taken again already.
    }
  }
  try {
    unlinkSync(aside);
  } catch {
    // Already gone.
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
  if (heldIn(contentOf(file))?.pid !== process.pid) return;
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
    const seen = contentOf(file);
    if (seen === undefined) continue;
    if (stale(file, seen, staleMs)) {
      takeOver(file, seen);
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
