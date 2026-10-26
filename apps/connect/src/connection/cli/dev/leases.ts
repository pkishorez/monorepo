import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/*
 * A lease says an App's dev process is using this branch's Connect:
 * `leases/<pid>.json`, `{ pid, app, startedAt }`. A shared Connect stops
 * once no live lease is left; a lease whose process is gone is pruned,
 * gone meaning dead, or its pid taken by a process started after the
 * lease was written.
 */

export interface Lease {
  readonly pid: number;
  readonly app: string;
  readonly startedAt: string;
}

/** A lease that does not read is pruned only once it is this old: until then it may be half written. */
const UNREADABLE_MS = 10_000;

const leasesOf = (dir: string) => join(dir, 'leases');

/** Whether a process with `pid` is running (or runs as another user). */
export const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** When process `pid` started, to the second, as `ps` says; undefined when it cannot tell. */
const startOf = (pid: number): number | undefined => {
  const ps = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  const at = ps.status === 0 ? Date.parse(ps.stdout.trim()) : Number.NaN;
  return Number.isNaN(at) ? undefined : at;
};

/**
 * Whether the process that was `pid` at `since` still runs: its pid is
 * alive and was not reused by a process started later. Without `ps` the
 * pid alone decides.
 */
export const runs = (pid: number, since: string | number): boolean => {
  if (!pidAlive(pid)) return false;
  const started = startOf(pid);
  return started === undefined || started <= new Date(since).getTime();
};

/** Takes a lease for `app` as process `pid`; the function returned gives it back, once. */
export const take = (
  dir: string,
  app: string,
  pid: number = process.pid,
): (() => void) => {
  mkdirSync(leasesOf(dir), { recursive: true, mode: 0o700 });
  const file = join(leasesOf(dir), `${pid}.json`);
  const lease: Lease = { pid, app, startedAt: new Date().toISOString() };
  // Whole or not at all: a reader never sees half a lease under its name.
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(lease), { mode: 0o600 });
  renameSync(temp, file);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      unlinkSync(file);
    } catch {
      // Already gone.
    }
  };
};

/** Reads the lease at `file`; undefined when it does not read. */
const leaseAt = (file: string): Lease | undefined => {
  try {
    const lease = JSON.parse(readFileSync(file, 'utf8')) as Partial<Lease>;
    if (typeof lease.pid === 'number' && typeof lease.startedAt === 'string')
      return lease as Lease;
  } catch {
    // Missing, or written half.
  }
  return undefined;
};

/** Whether the file at `file` is older than `ms`; true when it is gone. */
const olderThan = (file: string, ms: number): boolean => {
  try {
    return Date.now() - statSync(file).mtimeMs > ms;
  } catch {
    return true;
  }
};

/** The leases whose process still runs; the others are deleted, and one that does not read yet is skipped. */
export const live = (dir: string): ReadonlyArray<Lease> => {
  let names: ReadonlyArray<string>;
  try {
    names = readdirSync(leasesOf(dir));
  } catch {
    return [];
  }
  const leases: Array<Lease> = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = join(leasesOf(dir), name);
    const lease = leaseAt(file);
    if (lease === undefined && !olderThan(file, UNREADABLE_MS)) continue;
    if (lease !== undefined && runs(lease.pid, lease.startedAt)) {
      leases.push(lease);
      continue;
    }
    try {
      unlinkSync(file);
    } catch {
      // Pruned by another process.
    }
  }
  return leases;
};
