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
import { Effect, Layer, Schedule } from 'effect';
import { McpProtocol, McpServer } from 'effect/ai';
import { HttpRouter } from 'effect/http';
import { RpcClient } from 'effect/rpc';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import {
  KabukiSession,
  dialSessions,
  kabukiRoutes,
  remote,
} from '@kestack/devtools-kabuki/devtools';
import type { Node } from '@kestack/devtools-kabuki/devtools';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { AppApi, RPC_PATH } from '@kestack/connect-cloud/app';
import { connectionsTable, serveOver } from '@kestack/connect-cloud/server';
import { client as httpClient } from '@kestack/rpc-toolkit/rpc/http';
import { versionedClient } from '@kestack/rpc-toolkit/rpc/version-gap';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { OUTDATED_EXIT } from '../commands/index.js';
import { connectionFolders } from '../folders/index.js';
import { KEY_HEADER, pluginPath } from '../http/link/contract/index.js';
import { CLOUDFLARED_KEY } from '../services/cloudflared/real/index.js';
import { Echo } from './fixtures/echo.js';
import { releaseOf } from './fixtures/releases.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const KE_CONNECT = fileURLToPath(
  new URL('./fixtures/ke-connect.ts', import.meta.url),
);
const TUNNEL = 'https://e2e-test.trycloudflare.com';
const EMAIL = 'dev@kestack.test';

let home: string;
let runtime: string;
let authWorker: Server;
let authUrl: string;
let deviceCodes = 0;
const children: Array<ChildProcess> = [];
const releases = {
  echo: releaseOf('echo.mjs'),
  notes: releaseOf('echo.mjs', '// notes\n'),
};

const env = () => ({
  ...process.env,
  XDG_DATA_HOME: join(home, 'data'),
  XDG_STATE_HOME: join(home, 'state'),
  XDG_CACHE_HOME: join(home, 'cache'),
  XDG_RUNTIME_DIR: runtime,
});

const where = () => ({
  env: env(),
  platform: process.platform,
  home,
  tmp: tmpdir(),
});

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

const fakeToken = `local.${Buffer.from(JSON.stringify({ id: EMAIL, email: EMAIL, name: 'dev' })).toString('base64url')}`;

const startAuthWorker = async () => {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname.replace(
      '/api/auth',
      '',
    );
    const answer = (body: unknown) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    request.resume();
    request.on('end', () => {
      switch (path) {
        case '/device/code':
          deviceCodes++;
          return answer({
            device_code: 'dc',
            user_code: 'ABCD-EFGH',
            verification_uri: `${authUrl}/device`,
            verification_uri_complete: `${authUrl}/device?user_code=ABCD-EFGH`,
            interval: 0,
          });
        case '/device/token':
          return answer({ access_token: fakeToken, token_type: 'Bearer' });
        case '/get-session':
          return answer(
            request.headers.authorization === `Bearer ${fakeToken}`
              ? {
                  user: { id: EMAIL, email: EMAIL, name: 'dev' },
                  session: { token: fakeToken },
                }
              : null,
          );
        default:
          return answer({ success: true });
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  return {
    server,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  };
};

const startCloud = async (minConnect?: string) => {
  const driver = makeNodeSQLite({ path: ':memory:' });
  await Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  );
  const answer = serveOver({
    guard: fakeGuard.rpc(),
    authInfo: { url: authUrl },
    origins: [],
    driver,
    catalog: {
      echo: { ...releases.echo, enabledByDefault: true },
      notes: { ...releases.notes, enabledByDefault: false },
    },
    ...(minConnect === undefined ? {} : { minConnect }),
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
  return {
    server,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  };
};

const app = <A, E>(
  cloud: string,
  use: (api: RpcClient.FromGroup<typeof AppApi>) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          httpClient(AppApi, {
            url: `${cloud}${RPC_PATH}`,
            headers: { authorization: `Bearer ${fakeToken}` },
          }),
        );
        const api = yield* versionedClient(AppApi).pipe(
          Effect.provideContext(context),
        );
        return yield* use(api as never);
      }),
    ),
  );

const echoAt = (port: number, key: string, name: 'echo' | 'notes' = 'echo') =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          httpClient(Echo, {
            url: `http://127.0.0.1:${port}${pluginPath(name, releases[name].hash)}`,
            headers: { [KEY_HEADER]: key },
          }),
        );
        const echo = yield* RpcClient.make(Echo).pipe(
          Effect.provideContext(context),
        );
        return yield* echo.remember({ text: name });
      }),
    ).pipe(Effect.timeout('10 seconds')),
  );

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

const keConnect = (args: ReadonlyArray<string>) => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', KE_CONNECT, ...args],
    {
      cwd: ROOT,
      env: env(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
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

const runToEnd = async (args: ReadonlyArray<string>) => {
  const run = keConnect(args);
  const code = await run.exited;
  return { code, output: run.output() };
};

const theConnection = (cloud: string, notKey?: string) =>
  vi.waitFor(
    async () => {
      const listed = await app(cloud, (api) => api.List());
      const [only] = listed;
      if (only === undefined || only.url === null || only.key === notKey)
        throw new Error('not reported yet');
      return only;
    },
    { timeout: 60_000, interval: 250 },
  );

const treeOf = (node: Node): ReadonlyArray<string> => [
  `${node.actor}${node.key === undefined ? '' : ` ${node.key}`}: ${node.state}`,
  ...node.children.flatMap(treeOf),
];

const devtoolsAt = (port: number) =>
  Layer.build(
    HttpRouter.serve(
      kabukiRoutes({ origins: [] }).pipe(
        Layer.provide(
          McpServer.layerHttp({
            name: 'devtools',
            version: '0.0.0',
            path: '/mcp',
            protocols: [McpProtocol.v2025_06_18],
          }),
        ),
      ),
      {
        disableLogger: true,
        disableListenLog: true,
      },
    ).pipe(
      Layer.provide(
        NodeHttpServer.layer(createServer, {
          host: '127.0.0.1',
          port,
          disablePreemptiveShutdown: true,
        }),
      ),
    ),
  );

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'kc2-e2e-'));
  runtime = mkdtempSync('/tmp/kc2-run-');
  fakeCloudflared();
  ({ server: authWorker, url: authUrl } = await startAuthWorker());
});

afterAll(async () => {
  for (const child of children)
    if (child.exitCode === null) child.kill('SIGKILL');
  authWorker.closeAllConnections();
  await new Promise((resolve) => authWorker.close(resolve));
  rmSync(home, { recursive: true, force: true });
  rmSync(runtime, { recursive: true, force: true });
});

describe('ke-connect, end to end', () => {
  it('signs in, opens its tunnel, reports, runs what Connect Cloud enables, and stops', async () => {
    const cloud = await startCloud();
    const port = await freePort();
    const serving = keConnect([
      'serve',
      'e2e',
      '--cloud',
      cloud.url,
      '--port',
      String(port),
      '--heartbeat',
      '1',
    ]);

    const connection = await theConnection(cloud.url);
    expect(connection).toMatchObject({ url: TUNNEL, outdated: false });
    expect(connection.plugins).toEqual({ echo: releases.echo.hash });
    expect(deviceCodes).toBe(1);

    const remembered = await vi.waitFor(() => echoAt(port, connection.key), {
      timeout: 30_000,
      interval: 250,
    });
    expect(remembered).toEqual(['echo']);

    const again = await runToEnd(['serve', 'e2e', '--cloud', cloud.url]);
    expect(again.code).toBe(0);
    expect(again.output).toContain(`e2e is already running at ${TUNNEL}`);

    const listed = await runToEnd(['list']);
    expect(listed.output).toMatch(new RegExp(`e2e\\trunning\\t${TUNNEL}`));

    await app(cloud.url, (api) =>
      api.EnablePlugin({ id: connection.id, plugin: 'notes' }),
    );
    await vi.waitFor(() => echoAt(port, connection.key, 'notes'), {
      timeout: 30_000,
      interval: 250,
    });

    await app(cloud.url, (api) =>
      api.DisablePlugin({ id: connection.id, plugin: 'echo' }),
    );
    await vi.waitFor(
      async () => {
        const answered = await fetch(
          `http://127.0.0.1:${port}${pluginPath('echo', releases.echo.hash)}`,
          {
            method: 'POST',
            body: '',
            headers: { [KEY_HEADER]: connection.key },
          },
        );
        expect(answered.status).toBe(404);
      },
      { timeout: 30_000, interval: 250 },
    );

    const stopped = await runToEnd(['stop', 'e2e']);
    expect(stopped.output).toContain('Stopped e2e');
    expect(await serving.exited).toBe(0);

    const restarted = keConnect([
      'serve',
      'e2e',
      '--cloud',
      cloud.url,
      '--port',
      String(port),
      '--heartbeat',
      '1',
    ]);
    const same = await theConnection(cloud.url, connection.key);
    expect(same.id).toBe(connection.id);
    expect(deviceCodes).toBe(1);
    expect(
      await vi.waitFor(() => echoAt(port, same.key, 'notes'), {
        timeout: 30_000,
        interval: 250,
      }),
    ).toEqual(['notes', 'notes']);

    await app(cloud.url, (api) => api.Remove({ id: connection.id }));
    expect(await restarted.exited).toBe(1);
    expect(restarted.output()).toContain('e2e was removed from the app');

    const own = connectionFolders('e2e', where());
    const removed = await runToEnd(['remove', 'e2e']);
    expect(removed.code).toBe(0);
    expect(removed.output).toContain(
      `its Plugins' data is kept in ${own.plugins}`,
    );
    expect(existsSync(own.db)).toBe(false);
    expect(readFileSync(join(own.plugins, 'notes', 'notes.txt'), 'utf8')).toBe(
      'notes\nnotes\n',
    );

    await new Promise((resolve) => cloud.server.close(resolve));
  }, 180_000);

  it('shows its live Kabuki tree in DevTools while it serves', async () => {
    const cloud = await startCloud();
    const devtools = await freePort();
    const serving = keConnect([
      'serve',
      'shown',
      '--cloud',
      cloud.url,
      '--heartbeat',
      '1',
      '--devtools',
      `http://127.0.0.1:${devtools}`,
    ]);
    const expected = [
      'Connect: SignedIn',
      'Tunnel: Active',
      `Plugin echo@${releases.echo.hash}: Running`,
    ];
    const shown = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* devtoolsAt(devtools);
          const sessions = yield* dialSessions(`http://127.0.0.1:${devtools}`);
          yield* sessions.list().pipe(
            Effect.repeat({
              until: (list) =>
                list.some((each) => each.name === 'ke-connect-shown'),
              schedule: Schedule.spaced('250 millis'),
            }),
            Effect.timeout('60 seconds'),
          );
          const session = yield* KabukiSession.pipe(
            Effect.provideContext(
              yield* Layer.build(
                remote(`http://127.0.0.1:${devtools}`, 'ke-connect-shown'),
              ),
            ),
          );
          return yield* session.step({}).pipe(
            Effect.map(({ tree }) => treeOf(tree)),
            Effect.repeat({
              until: (tree) =>
                JSON.stringify(tree) === JSON.stringify(expected),
              schedule: Schedule.spaced('250 millis'),
            }),
            Effect.timeout('60 seconds'),
          );
        }),
      ),
    );
    expect(shown).toEqual(expected);
    const stopped = await runToEnd(['stop', 'shown']);
    expect(stopped.output).toContain('Stopped shown');
    expect(await serving.exited).toBe(0);
    await new Promise((resolve) => cloud.server.close(resolve));
  }, 120_000);

  it('exits with its own code, saying why, when Connect Cloud finds it too old', async () => {
    const cloud = await startCloud('99.0.0');
    const run = await runToEnd([
      'serve',
      'old',
      '--cloud',
      cloud.url,
      '--heartbeat',
      '1',
    ]);
    console.log(run.output);
    expect(run.code).toBe(OUTDATED_EXIT);
    expect(run.output).toContain(
      'is older than Connect Cloud accepts (99.0.0)',
    );
    await new Promise((resolve) => cloud.server.close(resolve));
  }, 120_000);
});
