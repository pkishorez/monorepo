import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { slugOf } from './branch.js';
import { live, runs, take } from './leases.js';
import { takeOver, withLock } from './lock.js';
import {
  type ConnectRecord,
  readRecord,
  standingOf,
  stopUnlessLeased,
  writeRecord,
} from './record.js';
import { proxyUp } from './terminal.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'connect-dev-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A pid that no process has: one that just exited. */
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid ?? 1 << 22;

describe('slugOf', () => {
  it('is main for the checkout, and the prefix in a worktree', () => {
    expect(slugOf('https://connect.kishore.computer')).toBe('main');
    expect(slugOf('https://feat-x.connect.kishore.computer')).toBe('feat-x');
    expect(slugOf('https://feat-x.connect.kishore.localhost:1355')).toBe(
      'feat-x',
    );
  });

  it("refuses a URL that is not Connect's", () => {
    expect(() => slugOf('https://code.kishore.computer')).toThrow();
  });
});

describe('withLock', () => {
  it('takes over a lock whose process is dead', async () => {
    writeFileSync(
      join(dir, 'lock'),
      JSON.stringify({ pid: deadPid(), at: Date.now() }),
    );
    const held = await withLock(
      dir,
      async () =>
        JSON.parse(readFileSync(join(dir, 'lock'), 'utf8')) as { pid: number },
    );
    expect(held.pid).toBe(process.pid);
    expect(existsSync(join(dir, 'lock'))).toBe(false);
  });

  it('takes over a live lock once it is too old', async () => {
    writeFileSync(
      join(dir, 'lock'),
      JSON.stringify({ pid: process.ppid, at: Date.now() - 61_000 }),
    );
    expect(await withLock(dir, async () => 'taken')).toBe('taken');
  });

  it('waits for a fresh live lock, then gives up', async () => {
    writeFileSync(
      join(dir, 'lock'),
      JSON.stringify({ pid: process.ppid, at: Date.now() }),
    );
    await expect(
      withLock(dir, async () => 'taken', { retryMs: 10, timeoutMs: 50 }),
    ).rejects.toThrow(/Could not take/);
  });

  it('leaves a lock taken again since it was judged stale', () => {
    const file = join(dir, 'lock');
    const seen = JSON.stringify({ pid: deadPid(), at: Date.now() });
    const fresh = JSON.stringify({ pid: process.ppid, at: Date.now() });
    writeFileSync(file, fresh);
    takeOver(file, seen);
    expect(readFileSync(file, 'utf8')).toBe(fresh);
    takeOver(file, fresh);
    expect(existsSync(file)).toBe(false);
  });

  it('gives one owner when a late contender takes over a lock already taken over', async () => {
    const file = join(dir, 'lock');
    const seen = JSON.stringify({ pid: deadPid(), at: Date.now() });
    writeFileSync(file, seen);
    // A and B both judge the lock stale. B takes it over and takes it.
    expect(takeOver(file, seen)).toBe(true);
    const fresh = JSON.stringify({ pid: process.ppid, at: Date.now() });
    writeFileSync(file, fresh, { flag: 'wx' });
    // A comes late: B's lock stays, so C finds it held and waits.
    expect(takeOver(file, seen)).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(fresh);
    await expect(
      withLock(dir, async () => 'taken', { retryMs: 10, timeoutMs: 50 }),
    ).rejects.toThrow(/Could not take/);
    expect(readFileSync(file, 'utf8')).toBe(fresh);
    expect(readdirSync(dir)).toEqual(['lock']);
  });

  it('leaves a stale lock to the process holding its guard, and clears a guard whose holder died', () => {
    const file = join(dir, 'lock');
    const seen = JSON.stringify({ pid: deadPid(), at: Date.now() });
    writeFileSync(file, seen);
    const guard = `${file}.${createHash('sha256').update(seen).digest('hex').slice(0, 16)}`;
    // Another, live, process is taking it over.
    writeFileSync(guard, JSON.stringify({ pid: process.ppid, at: Date.now() }));
    expect(takeOver(file, seen)).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(seen);
    expect(existsSync(guard)).toBe(true);
    // It died doing so.
    writeFileSync(guard, JSON.stringify({ pid: deadPid(), at: Date.now() }));
    expect(takeOver(file, seen)).toBe(false);
    expect(existsSync(guard)).toBe(false);
    expect(takeOver(file, seen)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('gives back only its own lock, never one taken over since', async () => {
    const file = join(dir, 'lock');
    const fresh = JSON.stringify({ pid: process.ppid, at: Date.now() });
    await withLock(dir, async () => {
      takeOver(file, readFileSync(file, 'utf8'));
      writeFileSync(file, fresh, { flag: 'wx' });
    });
    expect(readFileSync(file, 'utf8')).toBe(fresh);
  });
});

describe('leases', () => {
  it('lists live leases and prunes dead ones', () => {
    const release = take(dir, 'code');
    take(dir, 'gone', deadPid());
    expect(live(dir).map((lease) => lease.app)).toEqual(['code']);
    expect(existsSync(join(dir, 'leases', `${process.pid}.json`))).toBe(true);
    release();
    expect(live(dir)).toEqual([]);
  });

  it('skips a lease that does not read yet, and prunes it once old', () => {
    const file = join(dir, 'leases', '123.json');
    take(dir, 'code')();
    writeFileSync(file, '{"pid":');
    expect(live(dir)).toEqual([]);
    expect(existsSync(file)).toBe(true);
    const old = new Date(Date.now() - 11_000);
    utimesSync(file, old, old);
    expect(live(dir)).toEqual([]);
    expect(existsSync(file)).toBe(false);
  });

  it('prunes a lease whose pid a later process took', () => {
    take(dir, 'code')();
    writeFileSync(
      join(dir, 'leases', `${process.pid}.json`),
      JSON.stringify({
        pid: process.pid,
        app: 'old',
        startedAt: new Date(0).toISOString(),
      }),
    );
    expect(live(dir)).toEqual([]);
  });
});

describe('runs', () => {
  it('is true for a process started before `since`, false for one started after or dead', () => {
    expect(runs(process.pid, Date.now())).toBe(true);
    expect(runs(process.pid, 0)).toBe(false);
    expect(runs(deadPid(), Date.now())).toBe(false);
  });
});

describe('standingOf', () => {
  const record: ConnectRecord = {
    pid: process.pid,
    mode: 'shared',
    cloud: 'https://feat-x.connect.kishore.computer/',
    port: 4999,
    machine: { id: 'm1', name: 'host (feat-x)' },
    ready: true,
    startedAt: new Date().toISOString(),
    version: '0.0.2',
  };
  const asked: Array<string> = [];
  const answering =
    (down: ReadonlyArray<string> = []): typeof fetch =>
    async (input) => {
      const url = String(input);
      asked.push(url);
      return new Response('', { status: down.includes(url) ? 503 : 200 });
    };

  it('is alive when ready and both /auth and /health answer', async () => {
    asked.length = 0;
    expect((await standingOf(record, answering())).kind).toBe('alive');
    expect(asked.sort()).toEqual([
      'http://127.0.0.1:4999/health',
      'https://feat-x.connect.kishore.computer/auth',
    ]);
  });

  it('is starting while not ready, or while one does not answer', async () => {
    expect(
      (await standingOf({ ...record, ready: false }, answering())).kind,
    ).toBe('starting');
    expect(
      (await standingOf(record, answering(['http://127.0.0.1:4999/health'])))
        .kind,
    ).toBe('starting');
  });

  it('is absent without a record, or when its process is dead', async () => {
    expect((await standingOf(undefined, answering())).kind).toBe('absent');
    expect((await standingOf(record, answering(), () => false)).kind).toBe(
      'absent',
    );
  });

  it('is absent when its pid was taken by a later process', async () => {
    expect(
      (
        await standingOf(
          { ...record, startedAt: new Date(0).toISOString() },
          answering(),
        )
      ).kind,
    ).toBe('absent');
  });

  it('is stopping once it decided to stop, until its process is gone', async () => {
    const stopping = { ...record, stopping: true };
    expect((await standingOf(stopping, answering())).kind).toBe('stopping');
    expect((await standingOf(stopping, answering(), () => false)).kind).toBe(
      'absent',
    );
  });
});

describe('stopUnlessLeased', () => {
  const record: ConnectRecord = {
    pid: process.pid,
    mode: 'shared',
    cloud: 'https://connect.kishore.computer',
    port: 4999,
    machine: null,
    ready: true,
    startedAt: new Date().toISOString(),
    version: '0.0.2',
  };

  it('stays while an App holds a lease', async () => {
    writeRecord(dir, record);
    const release = take(dir, 'code');
    expect(await stopUnlessLeased(dir)).toBe(false);
    expect(readRecord(dir)?.stopping).toBeUndefined();
    release();
  });

  it('marks the record stopping, under the lock, once none does', async () => {
    writeRecord(dir, record);
    expect(await stopUnlessLeased(dir)).toBe(true);
    expect(readRecord(dir)?.stopping).toBe(true);
    expect(existsSync(join(dir, 'lock'))).toBe(false);
  });
});

describe('proxyUp', () => {
  it('is false when nothing listens on the port', async () => {
    expect(await proxyUp('https://connect.kishore.localhost:1')).toBe(false);
  });
});
