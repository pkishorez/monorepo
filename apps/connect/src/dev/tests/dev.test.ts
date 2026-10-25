import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { slugOf } from '../branch.js';
import { live, runs, take } from '../leases.js';
import { lockPort, withLock } from '../lock.js';
import {
  type ConnectRecord,
  readRecord,
  standingOf,
  stopUnlessLeased,
  writeRecord,
} from '../record.js';
import { proxyUp } from '../terminal.js';

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
  /** Runs `fn` holding the lock, noting when it starts and ends. */
  const hold = (lockDir: string, name: string, log: string[]) =>
    withLock(lockDir, async () => {
      log.push(`${name} in`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      log.push(`${name} out`);
    });

  it('runs two holders of one lock strictly one after the other', async () => {
    const log: string[] = [];
    await Promise.all([hold(dir, 'a', log), hold(dir, 'b', log)]);
    expect(log).toEqual(['a in', 'a out', 'b in', 'b out']);
  });

  it('runs holders of different locks side by side', async () => {
    const other = mkdtempSync(join(tmpdir(), 'connect-dev-'));
    try {
      expect(lockPort(other)).not.toBe(lockPort(dir));
      const log: string[] = [];
      await Promise.all([hold(dir, 'a', log), hold(other, 'b', log)]);
      expect(log.slice(0, 2).sort()).toEqual(['a in', 'b in']);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('is free right after the process holding it is killed', async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `require('node:net').createServer().listen(${lockPort(dir)}, '127.0.0.1', () => console.log('held'))`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise((resolve) => child.stdout.once('data', resolve));
    await expect(
      withLock(dir, async () => 'taken', { retryMs: 10, timeoutMs: 50 }),
    ).rejects.toThrow();
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    expect(
      await withLock(dir, async () => 'taken', {
        retryMs: 10,
        timeoutMs: 1000,
      }),
    ).toBe('taken');
  });

  it('takes a port outside the ranges the OS hands out for port 0', () => {
    for (const port of [lockPort(dir), lockPort('/a'), lockPort('/b')]) {
      expect(port).toBeGreaterThanOrEqual(20_000);
      expect(port).toBeLessThan(30_000);
    }
  });

  it('gives the lock back promptly while a client is connected to it', async () => {
    let client: Socket | undefined;
    const started = Date.now();
    const result = await withLock(dir, async () => {
      const socket = connect(lockPort(dir), '127.0.0.1');
      client = socket;
      socket.on('error', () => {});
      await new Promise((resolve) => socket.once('connect', resolve));
      socket.write('hello');
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'done';
    });
    expect(result).toBe('done');
    expect(Date.now() - started).toBeLessThan(1000);
    client?.destroy();
  });

  it('names the port when it gives up', async () => {
    await withLock(dir, async () => {
      await expect(
        withLock(dir, async () => 'taken', { retryMs: 10, timeoutMs: 50 }),
      ).rejects.toThrow(
        new RegExp(
          `port ${lockPort(dir)} is held; if no ke-connect dev is running, another program owns it`,
        ),
      );
    });
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
    expect(
      await withLock(dir, async () => 'free', { retryMs: 10, timeoutMs: 50 }),
    ).toBe('free');
  });
});

describe('proxyUp', () => {
  it('is false when nothing listens on the port', async () => {
    expect(await proxyUp('https://connect.kishore.localhost:1')).toBe(false);
  });
});
