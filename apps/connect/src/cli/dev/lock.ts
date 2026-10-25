import { createHash, randomUUID } from 'node:crypto';
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
 * started: a lock file made with `open(…, 'wx')`, holding `{ pid, at,
 * token }`, so no two locks ever say the same. A lock whose pid is dead,
 * or older than a minute, is stale and is taken over.
 *
 * A lock is only ever removed while it still says what was judged, by the
 * one process that made its guard: `lock.<digest of what it says>`, made
 * with `wx` too. Under the guard it is read again and removed only if it
 * still says the same; a lock taken since says something else and stays.
 * Giving a lock back goes through its guard as well, so no lock is removed
 * between being read and being removed. A guard left by a process that
 * died holding it is stale like a lock, and is removed the same way.
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

const STALE_MS = 60_000;

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

/** Makes `file` for this process, if it is free; what it says when made. */
const make = (file: string): string | undefined => {
  const text = JSON.stringify({
    pid: process.pid,
    at: Date.now(),
    token: randomUUID(),
  });
  try {
    const fd = openSync(file, 'wx', 0o600);
    try {
      writeSync(fd, text);
    } finally {
      closeSync(fd);
    }
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined;
    throw error;
  }
};

/** Removes `file`, ignoring that it is gone. */
const unlink = (file: string) => {
  try {
    unlinkSync(file);
  } catch {
    // Already gone.
  }
};

/**
 * Removes `file` if it still says `seen`, under its guard; true when
 * removed. While another process holds the guard it is left to that one;
 * a guard that is stale is removed, and the caller tries again.
 */
const removeIfStill = (
  file: string,
  seen: string,
  staleMs: number = STALE_MS,
): boolean => {
  const guard = `${file}.${createHash('sha256').update(seen).digest('hex').slice(0, 16)}`;
  const mine = make(guard);
  if (mine === undefined) {
    const held = contentOf(guard);
    if (held !== undefined && stale(guard, held, staleMs))
      removeIfStill(guard, held, staleMs);
    return false;
  }
  try {
    if (contentOf(file) !== seen) return false;
    unlinkSync(file);
    return true;
  } finally {
    if (contentOf(guard) === mine) unlink(guard);
  }
};

/** Removes the stale lock at `file`, judged so while it said `seen`, unless it was taken again since; true when removed. */
export const takeOver = (file: string, seen: string, staleMs = STALE_MS) =>
  removeIfStill(file, seen, staleMs);

/** Runs `fn` holding the lock in `dir`, taking over a stale one; fails after `timeoutMs`. */
export const withLock = async <A>(
  dir: string,
  fn: () => Promise<A>,
  options: LockOptions = {},
): Promise<A> => {
  const { staleMs = STALE_MS, retryMs = 100, timeoutMs = 30_000 } = options;
  const file = lockFile(dir);
  const until = Date.now() + timeoutMs;
  let mine: string | undefined;
  while ((mine = make(file)) === undefined) {
    const seen = contentOf(file);
    if (seen === undefined) continue;
    if (stale(file, seen, staleMs) && takeOver(file, seen, staleMs)) continue;
    if (Date.now() > until)
      throw new Error(
        `Could not take ${file} within ${timeoutMs / 1000} s; is another dev starting? Delete it if not.`,
      );
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  try {
    return await fn();
  } finally {
    // Only while it is still this process's: one taken over since stays.
    removeIfStill(file, mine, staleMs);
  }
};
