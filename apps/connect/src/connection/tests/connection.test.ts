import { type ChildProcess, spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context, Effect, Layer } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { connectionsTable, serveOver } from '../../cloud/worker/index.js';
import { CodeClient } from '../../plugins/code/api/index.js';
import { CLOUDFLARED_KEY } from '../actor-connection/actor-online/index.js';

/*
 * `ke-connect` end to end, each command its own process, as a user runs it:
 * `serve e2e` signs in with auth-toolkit's Fake to a Cloud Connect in this
 * process, opens a tunnel through a fake cloudflared, and runs the code
 * Plugin from a file, on a fake harness. Code's client reaches the Plugin
 * through the router at `/code/rpc` with the Connection Key. A second
 * `serve e2e` finds it running; `list` shows it; `remove e2e` stops it and
 * deletes its folders.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const KE_CONNECT = fileURLToPath(
  new URL('./fixtures/ke-connect.ts', import.meta.url),
);
const FAKE_CODE = fileURLToPath(
  new URL('./fixtures/fake-code.mjs', import.meta.url),
);
const TUNNEL = 'https://e2e-test.trycloudflare.com';

let home: string;
let cloud: Server;
let cloudUrl: string;
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

/** Cloud Connect over an in-memory database, signing in with the Fake, on a port of its own. */
const startCloud = async () => {
  const driver = makeNodeSQLite({ path: ':memory:' });
  await Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  );
  const answer = serveOver({
    guard: fakeGuard.rpc(),
    authInfo: { url: 'https://auth.test' },
    origins: [],
    driver,
  });
  const server = createServer(async (request, response) => {
    const chunks: Array<Buffer> = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
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
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}` };
};

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
  ({ server: cloud, url: cloudUrl } = await startCloud());
});

afterAll(async () => {
  for (const child of children)
    if (child.exitCode === null) child.kill('SIGKILL');
  await new Promise((resolve) => cloud.close(resolve));
  rmSync(home, { recursive: true, force: true });
});

describe('ke-connect', () => {
  it('serves a Connection whose code Plugin answers through the router, once per name, and removes it', async () => {
    const port = await freePort();
    const serving = keConnect([
      'serve',
      'e2e',
      '--cloud',
      cloudUrl,
      '--port',
      String(port),
      '--heartbeat',
      '1',
      '--plugin',
      `code=${FAKE_CODE}`,
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
      const { key } = JSON.parse(
        readFileSync(join(data, 'connection.json'), 'utf8'),
      ) as { readonly key: string };

      // Code's client, through the router, to the code Plugin.
      const harnesses = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(
              CodeClient.layer(`ws://127.0.0.1:${port}/code/rpc`, { key }),
            );
            return yield* Context.get(context, CodeClient).harnesses();
          }),
        ).pipe(Effect.timeout('60 seconds')),
      );
      expect(harnesses).toMatchObject([{ harness: 'claude' }]);

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
});
