import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/*
 * A lease says an App's dev process is using this branch's Connect:
 * `leases/<pid>.json`, `{ pid, app, startedAt }`. A shared Connect stops
 * once no live lease is left; a lease whose pid is dead is pruned.
 */

export interface Lease {
  readonly pid: number;
  readonly app: string;
  readonly startedAt: string;
}

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

/** Takes a lease for `app` as process `pid`; the function returned gives it back, once. */
export const take = (
  dir: string,
  app: string,
  pid: number = process.pid,
): (() => void) => {
  mkdirSync(leasesOf(dir), { recursive: true, mode: 0o700 });
  const file = join(leasesOf(dir), `${pid}.json`);
  const lease: Lease = { pid, app, startedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(lease), { mode: 0o600 });
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

/** The leases whose process still runs; the others are deleted. */
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
    let lease: Lease | undefined;
    try {
      lease = JSON.parse(readFileSync(file, 'utf8')) as Lease;
    } catch {
      lease = undefined;
    }
    if (
      lease !== undefined &&
      typeof lease.pid === 'number' &&
      pidAlive(lease.pid)
    ) {
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
