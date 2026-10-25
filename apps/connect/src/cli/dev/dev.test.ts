import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { slugOf } from './branch.js';
import { live, take } from './leases.js';
import { withLock } from './lock.js';
import { type ConnectRecord, standingOf } from './record.js';
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
});

describe('standingOf', () => {
  const record: ConnectRecord = {
    pid: process.pid,
    mode: 'shared',
    cloud: 'https://feat-x.connect.kishore.computer/',
    port: 4999,
    machine: { id: 'm1', name: 'host (feat-x)' },
    ready: true,
    startedAt: new Date(0).toISOString(),
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
});

describe('proxyUp', () => {
  it('is false when nothing listens on the port', async () => {
    expect(await proxyUp('https://connect.kishore.localhost:1')).toBe(false);
  });
});
