import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { live, runs } from './leases.js';
import type { DevAuth } from './auth.js';
import { withLock } from './lock.js';

/*
 * `connect.json`: how this branch's Connect stands, written by whoever runs
 * it. It is alive only when its process runs, it says it is ready, Cloud
 * Connect answers `/auth` and the Machine answers `/health`; stopping once
 * a shared Connect has decided to stop, until its process exits; starting
 * while its process runs but it is not alive yet; absent otherwise. Its
 * process runs while its pid is alive and was not reused since `startedAt`.
 */

export interface ConnectRecord {
  readonly pid: number;
  /** Foreground: `pnpm dev` in apps/connect; shared: the detached supervisor. */
  readonly mode: 'foreground' | 'shared';
  readonly cloud: string;
  /** How it signs in; a record from before it said is `real`. */
  readonly auth?: DevAuth;
  /** The Machine's port; 0 until it listens. */
  readonly port: number;
  readonly machine: { readonly id: string; readonly name: string } | null;
  readonly ready: boolean;
  /** Before its process started, or as it did. */
  readonly startedAt: string;
  readonly version: string;
  /** Set once a shared Connect decided to stop: no lease may be taken on it. */
  readonly stopping?: boolean;
}

export type Standing =
  | { readonly kind: 'absent' }
  | { readonly kind: 'starting'; readonly record: ConnectRecord }
  | { readonly kind: 'stopping'; readonly record: ConnectRecord }
  | { readonly kind: 'alive'; readonly record: ConnectRecord };

const recordFile = (dir: string) => join(dir, 'connect.json');

/** The record in `dir`, if there is one that reads. */
export const readRecord = (dir: string): ConnectRecord | undefined => {
  try {
    return JSON.parse(readFileSync(recordFile(dir), 'utf8')) as ConnectRecord;
  } catch {
    return undefined;
  }
};

/** Writes `record` whole, through a temp file and a rename. */
export const writeRecord = (dir: string, record: ConnectRecord) => {
  const temp = `${recordFile(dir)}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
  renameSync(temp, recordFile(dir));
};

/** Deletes the record, when it is still `pid`'s. */
export const removeRecord = (dir: string, pid: number) => {
  if (readRecord(dir)?.pid !== pid) return;
  try {
    unlinkSync(recordFile(dir));
  } catch {
    // Already gone.
  }
};

/** Whether `GET url` answers 200 within two seconds. */
const answers = async (fetcher: typeof fetch, url: string) => {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    return response.status === 200;
  } catch {
    return false;
  }
};

/** How the Connect `record` describes stands, asking it over `fetcher`. */
export const standingOf = async (
  record: ConnectRecord | undefined,
  fetcher: typeof fetch = fetch,
  alive: (pid: number, since: string) => boolean = runs,
): Promise<Standing> => {
  if (record === undefined || !alive(record.pid, record.startedAt))
    return { kind: 'absent' };
  if (record.stopping === true) return { kind: 'stopping', record };
  const up =
    record.ready &&
    (
      await Promise.all([
        answers(fetcher, `${record.cloud.replace(/\/+$/, '')}/auth`),
        answers(fetcher, `http://127.0.0.1:${record.port}/health`),
      ])
    ).every(Boolean);
  return { kind: up ? 'alive' : 'starting', record };
};

/**
 * A shared Connect's decision to stop, holding the lock: when a live lease
 * is in `dir` it stays (false); else its record says it is stopping, so no
 * App leases it while it goes, and it may stop (true).
 */
export const stopUnlessLeased = (dir: string, pid: number = process.pid) =>
  withLock(dir, async () => {
    if (live(dir).length > 0) return false;
    markStopping(dir, pid);
    return true;
  });

/** Says in `dir`'s record that the Connect `pid` runs is stopping, when it is that one's. */
export const markStopping = (dir: string, pid: number = process.pid) => {
  const record = readRecord(dir);
  if (record?.pid === pid) writeRecord(dir, { ...record, stopping: true });
};
