import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Context, Effect, Layer } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { pluginPath } from '../../../contract/index.js';
import { connectionsTable, serveOver } from '../../../cloud/worker/index.js';
import { CodeClient } from '../../plugins/code/api/index.js';
import { CLOUDFLARED_KEY } from '../actor-identity/actor-connection/index.js';

/*
 * `ke-connect` end to end, each command its own process, as a user runs it:
 * `serve e2e` signs in with auth-toolkit's Fake to a Connect Cloud in this
 * process, opens a tunnel through a fake cloudflared, and runs the code
 * Plugin at the Release Connect Cloud names, on a fake harness, from a
 * folder. Code's client reaches the Plugin through the server at
 * `/code/<sha256>/rpc` with the Connection Key, read as Connect Cloud heard
 * it in a Report. A second `serve e2e` finds it running; `list` shows it; `remove e2e` stops it and
 * deletes its folders.
 */

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const KE_CONNECT = fileURLToPath(
  new URL('./fixtures/ke-connect.ts', import.meta.url),
);
const FAKE_CODE = fileURLToPath(
  new URL('./fixtures/fake-code.mjs', import.meta.url),
);
const TUNNEL = 'https://e2e-test.trycloudflare.com';

let home: string;
let code: { readonly hash: string; readonly url: string };
let cloud: Server;
let cloudUrl: string;
/** The Connection Key the last Report carried; null until one does. */
let reportedKey: string | null = null;
const children: Array<ChildProcess> = [];

const env = () => ({
  ...process.env,
  XDG_DATA_HOME: join(home, 'data'),
  XDG_STATE_HOME: join(home, 'state'),
  XDG_CACHE_HOME: join(home, 'cache'),
  XDG_RUNTIME_DIR: join(home, 'run'),
});

/** cloudflared as the shared cache keeps it: a script that prints a tunnel's address and its connection, then waits. */
const fakeCloudflared = () => {
  const entry = join(home, 'cache', 'kestack', 'downloads', CLOUDFLARED_KEY);
  mkdirSync(entry, { recursive: true });
  const binary = join(entry, 'cloudflared');
  writeFileSync(
    binary,
    [
      '#!/bin/sh',
      `echo "INF |  ${TUNNEL}  |"`,
      'echo "INF Registered tunnel connection connIndex=0 connection=12345678-1234-4123-8123-123456789abc event=0 ip=198.41.200.1 location=e2e protocol=http2"',
      'exec sleep 3600',
      '',
    ].join('\n'),
  );
  chmodSync(binary, 0o755);
};

/** A Release of the fake code Plugin, its file in a folder: one file that runs FAKE_CODE from where it is. */
const fakeRelease = () => {
  const content = `await import(${JSON.stringify(pathToFileURL(FAKE_CODE).href)});\n`;
  const hash = createHash('sha256').update(content).digest('hex');
  const file = join(home, `${hash}.mjs`);
  writeFileSync(file, content);
  return { hash, url: pathToFileURL(file).href };
};

/** The Connection Key a request carries, if it is a Report. */
const keyInReport = (body: Buffer) =>
  /"key":"([\w-]+)"/.exec(body.toString())?.[1] ?? null;

/** Connect Cloud over an in-memory database, signing in with the Fake, on `port`, else a port of its own. */
const startCloud = async (port = 0) => {
  const driver = makeNodeSQLite({ path: ':memory:' });
  await Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  );
  const answer = serveOver({
    guard: fakeGuard.rpc(),
    authInfo: { url: 'https://auth.test' },
    origins: [],
    driver,
    wanted: { code },
  });
  const server = createServer(async (request, response) => {
    const chunks: Array<Buffer> = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    reportedKey = keyInReport(Buffer.concat(chunks)) ?? reportedKey;
    const answered = await answer(
      new Request(`http://127.0.0.1${request.url}`, {
        method: request.method ?? 'GET',
        headers: Object.entries(request.headers).flatMap(([name, value]) =>
          value === undefined
            ? []
            : [[name, Array.isArray(value) ? value.join(', ') : value]],
        ),
        ...(request.method === 'GET' || request.method === 'HEAD'
          ? {}
          : { body: Buffer.concat(chunks) }),
      }),
    );
    response.writeHead(answered.status, Object.fromEntries(answered.headers));
    response.end(Buffer.from(await answered.arrayBuffer()));
  });
  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', () => resolve()),
  );
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}` };
};

/** The harnesses of the code Plugin on `port`, through the server with the key Connect Cloud last heard, once it answers. */
const harnessesAt = (port: number, timeout = 60_000) =>
  vi.waitFor(
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const key = reportedKey;
            if (key === null) return yield* Effect.die(new Error('no key yet'));
            const context = yield* Layer.build(
              CodeClient.layer(
                `ws://127.0.0.1:${port}${pluginPath('code', code.hash)}`,
                { key },
              ),
            );
            return yield* Context.get(context, CodeClient).harnesses();
          }),
        ).pipe(Effect.timeout('10 seconds')),
      ),
    { timeout, interval: 500 },
  );

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

/** `ke-connect <args>` from source, signing in with the Fake. */
const keConnect = (args: ReadonlyArray<string>) => {
  const child = spawn(
    process.execPath,
    ['--conditions=kestack-fake-auth', '--import', 'tsx', KE_CONNECT, ...args],
    { cwd: ROOT, env: env(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(child);
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', (code) => resolve(code)),
  );
  return { child, output: () => output, exited };
};

/** `ke-connect <args>` run to its end: its exit code and output. */
const runToEnd = async (args: ReadonlyArray<string>) => {
  const run = keConnect(args);
  const code = await run.exited;
  return { code, output: run.output() };
};

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'kc-'));
  fakeCloudflared();
  code = fakeRelease();
  ({ server: cloud, url: cloudUrl } = await startCloud());
});

afterAll(async () => {
  for (const child of children)
    if (child.exitCode === null) child.kill('SIGKILL');
  await new Promise((resolve) => cloud.close(resolve));
  rmSync(home, { recursive: true, force: true });
});

describe('ke-connect', () => {
  it('serves a Connection whose code Plugin answers through its server, once per name, and removes it', async () => {
    const port = await freePort();
    reportedKey = null;
    const serving = keConnect([
      'serve',
      'e2e',
      '--cloud',
      cloudUrl,
      '--port',
      String(port),
      '--heartbeat',
      '1',
    ]);
    const data = join(home, 'data', 'kestack', 'connect', 'connections', 'e2e');
    const state = join(
      home,
      'state',
      'kestack',
      'connect',
      'connections',
      'e2e',
    );
    try {
      await vi.waitFor(
        async () => {
          if (serving.child.exitCode !== null)
            throw new Error(`serve exited: ${serving.output()}`);
          expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(
            200,
          );
        },
        { timeout: 60_000, interval: 200 },
      );
      // Code's client, through the server, to the code Plugin, once it
      // runs the Release: until then the socket closes with 4409.
      expect(await harnessesAt(port)).toMatchObject([{ harness: 'claude' }]);

      // Once its tunnel is up, `list` and a second `serve` say so.
      await vi.waitFor(
        async () => {
          const listed = await runToEnd(['list']);
          expect(listed.output).toMatch(
            new RegExp(`^e2e\\trunning\\t${TUNNEL}\\t\\d{4}-`, 'm'),
          );
        },
        { timeout: 60_000, interval: 500 },
      );
      const again = await runToEnd(['serve', 'e2e', '--cloud', cloudUrl]);
      expect(again).toEqual({
        code: 0,
        output: `e2e is already running at ${TUNNEL}\n`,
      });

      const removed = await runToEnd(['remove', 'e2e']);
      expect(removed.output).toContain('Removed e2e');
      expect(removed.code).toBe(0);
      expect(await serving.exited).toBe(0);
      expect(existsSync(data)).toBe(false);
      expect(existsSync(state)).toBe(false);
      expect((await runToEnd(['list'])).output).toContain('No Connections yet');
    } catch (error) {
      throw new Error(
        `${String(error)}\n--- serve said:\n${serving.output()}`,
        {
          cause: error,
        },
      );
    }
  }, 180_000);

  /**
   * Serves the Connection `name` with Connect Cloud up until Code reaches its
   * code Plugin, stops both, has `down` stand where Connect Cloud was, and
   * serves it again: it signs in from what it kept and opens its port, with a
   * new key and no Plugin, until Connect Cloud comes back and names one.
   */
  const startsAgainWith = async (
    name: string,
    down: (port: number) => Promise<() => void>,
    expectations: (output: string) => void,
  ) => {
    reportedKey = null;
    const online = await startCloud();
    const cloudPort = Number(new URL(online.url).port);
    const port = await freePort();
    const args = [
      'serve',
      name,
      '--cloud',
      online.url,
      '--port',
      String(port),
      '--heartbeat',
      '1',
    ];
    const first = keConnect(args);
    let again: ReturnType<typeof keConnect> | undefined;
    let up = () => {};
    let back: Server | undefined;
    try {
      expect(await harnessesAt(port, 30_000)).toMatchObject([
        { harness: 'claude' },
      ]);
      const firstKey = reportedKey;
      first.child.kill('SIGTERM');
      await first.exited;
      online.server.closeAllConnections();
      await new Promise((resolve) => online.server.close(resolve));
      up = await down(cloudPort);
      reportedKey = null;
      again = keConnect(args);
      await vi.waitFor(
        async () => {
          if (again?.child.exitCode !== null) throw new Error('serve exited');
          expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(
            200,
          );
          expectations(again.output());
        },
        { timeout: 30_000, interval: 200 },
      );
      expect(again.child.exitCode).toBeNull();
      // Nothing it kept can reach a Plugin: the key is new, and none runs.
      expect(reportedKey).toBeNull();

      up();
      up = () => {};
      back = (await startCloud(cloudPort)).server;
      expect(await harnessesAt(port, 30_000)).toMatchObject([
        { harness: 'claude' },
      ]);
      expect(reportedKey).not.toBe(firstKey);
    } catch (error) {
      throw new Error(
        `${String(error)}\n--- first serve said:\n${first.output()}\n--- second serve said:\n${again?.output() ?? ''}`,
        { cause: error },
      );
    } finally {
      again?.child.kill('SIGTERM');
      if (again) await again.exited;
      up();
      back?.closeAllConnections();
      back?.close();
    }
  };

  it(
    'starts again with Connect Cloud down, from its stored Sign-in, and runs its Plugins once it is back',
    () =>
      // Connect Cloud cannot be asked how to sign in, nor told anything: the
      // Connection runs all the same, and keeps trying.
      startsAgainWith(
        'offline',
        async () => () => {},
        (output) => {
          expect(output).toMatch(/signing in as last time/);
          expect(output).toMatch(/Heartbeat not sent/);
        },
      ),
    180_000,
  );

  it(
    'starts again with a Connect Cloud that takes calls and never answers, and runs its Plugins once it does',
    () =>
      startsAgainWith(
        'stalled',
        async (port) => {
          const stalled = createServer(() => {});
          await new Promise<void>((resolve) =>
            stalled.listen(port, '127.0.0.1', () => resolve()),
          );
          return () => {
            stalled.closeAllConnections();
            stalled.close();
          };
        },
        (output) => {
          expect(output).toMatch(/signing in as last time/);
          expect(output).toMatch(
            /Heartbeat not sent: Connect Cloud did not answer/,
          );
        },
      ),
    180_000,
  );
});
