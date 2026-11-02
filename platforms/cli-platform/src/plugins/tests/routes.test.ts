import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { type IncomingHttpHeaders, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Layer } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { NodeSocket } from '@effect/platform-node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PluginAccess, PluginEnv, PluginPaths } from '../contract/index.js';
import { Area } from './fixtures/area.js';

/*
 * A Plugin's own routes beside its RPC group, end to end: a real Plugin
 * process from the `area` fixture, asked over its socket as its CLI would
 * pass requests on, with the key or without it.
 */

const fixture = fileURLToPath(new URL('./fixtures/area.mjs', import.meta.url));

const home = mkdtempSync(join(tmpdir(), 'kestack-routes-'));
const socket = join(home, 'area.sock');
/** The same Plugin, started by a CLI that says it marks every request. */
const markedSocket = join(home, 'marked.sock');
const children: Array<ChildProcess> = [];
let token = '';

const KEY = { [PluginAccess.header]: PluginAccess.key };
const PUBLIC = { [PluginAccess.header]: PluginAccess.public };

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/** Asks the Plugin's socket, `at`, for `path`, as written, with `headers`. */
const ask = (
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
  at = socket,
) =>
  new Promise<Answer>((done, failed) => {
    const asked = request({ socketPath: at, path, method, headers }, (r) => {
      const chunks: Array<Buffer> = [];
      r.on('data', (chunk: Buffer) => chunks.push(chunk));
      r.on('end', () =>
        done({
          status: r.statusCode ?? 0,
          headers: r.headers,
          body: Buffer.concat(chunks).toString(),
        }),
      );
    });
    asked.on('error', failed);
    asked.end();
  });

/** The Plugin's group at `at` over WebSocket, with the key. */
const ticket = (at = socket) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const protocol = yield* Layer.build(
          RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
            Layer.provide(
              Socket.layerWebSocket(`ws+unix://${at}:${PluginPaths.rpc}`, {
                headers: KEY,
              }),
            ),
            Layer.provide(NodeSocket.layerWebSocketConstructorWS),
            Layer.provide(RpcSerialization.layerJson),
          ),
        );
        const client = yield* RpcClient.make(Area).pipe(
          Effect.provide(protocol),
        );
        return yield* client.ticket();
      }),
    ),
  );

/** Starts the `area` fixture on `at`, its folders beside it, with `env` added; once it is ready. */
const start = async (at: string, env: Record<string, string> = {}) => {
  const folders = ['data', 'state', 'cache', 'shared'].map((name) =>
    join(`${at}.d`, name),
  );
  for (const folder of folders) mkdirSync(folder, { recursive: true });
  const [data, state, cache, shared] = folders as [
    string,
    string,
    string,
    string,
  ];
  const started = spawn(process.execPath, [fixture], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    env: {
      ...process.env,
      [PluginEnv.name]: 'area',
      [PluginEnv.socket]: at,
      [PluginEnv.data]: data,
      [PluginEnv.state]: state,
      [PluginEnv.cache]: cache,
      [PluginEnv.shared]: shared,
      ...env,
    },
  });
  children.push(started);
  await new Promise<void>((ready, failed) => {
    started.once('message', () => ready());
    started.once('exit', (code) => failed(new Error(`Exited ${code}`)));
  });
};

beforeAll(async () => {
  await Promise.all([
    start(socket),
    start(markedSocket, { [PluginEnv.access]: PluginAccess.header }),
  ]);
  token = await ticket();
}, 30_000);

afterAll(() => {
  for (const child of children) child.kill('SIGTERM');
});

describe('a Plugin with routes of its own', () => {
  it('answers its RPC group, its control and its keyed routes to the key alone', async () => {
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(await ask('/hello', KEY)).toMatchObject({
      status: 200,
      body: 'hello',
    });
    for (const path of ['/hello', PluginPaths.rpc, PluginPaths.control])
      for (const headers of [
        PUBLIC,
        { [PluginAccess.header]: 'KEY' },
        { [PluginAccess.header]: '' },
      ])
        expect((await ask(path, headers)).status).toBe(404);
    // With the key, `/rpc` is there: it wants a WebSocket, not a GET.
    expect((await ask(PluginPaths.rpc, KEY)).status).not.toBe(404);
  });

  it('takes a request with no access header as one with the key, as a CLI older than the Public Area passes on only those', async () => {
    expect(await ask('/hello', {})).toMatchObject({
      status: 200,
      body: 'hello',
    });
    expect((await ask(PluginPaths.rpc, {})).status).not.toBe(404);
  });

  it('answers nothing to a request with no access header once its CLI says it marks every one', async () => {
    const clip = `/public/${await ticket(markedSocket)}/clip.txt`;
    for (const path of ['/hello', PluginPaths.rpc, PluginPaths.control, clip])
      expect([path, (await ask(path, {}, 'GET', markedSocket)).status]).toEqual(
        [path, 404],
      );
    expect(await ask(clip, PUBLIC, 'GET', markedSocket)).toMatchObject({
      status: 200,
      body: '0123456789',
    });
    expect(await ask('/hello', KEY, 'GET', markedSocket)).toMatchObject({
      status: 200,
      body: 'hello',
    });
    expect((await ask('/hello', PUBLIC, 'GET', markedSocket)).status).toBe(404);
    expect(
      (await ask(PluginPaths.rpc, KEY, 'GET', markedSocket)).status,
    ).not.toBe(404);
  });

  it('answers its Public Area to anyone, with the services its handlers share', async () => {
    const path = `/public/${token}/clip.txt`;
    for (const headers of [{}, PUBLIC, KEY]) {
      const answer = await ask(path, headers);
      expect(answer).toMatchObject({ status: 200, body: '0123456789' });
      expect(answer.headers).toMatchObject({
        'accept-ranges': 'bytes',
        'content-security-policy': 'sandbox',
        'content-type': 'text/plain',
        'content-length': '10',
      });
    }
    expect((await ask(`/public/${'0'.repeat(36)}/clip.txt`)).status).toBe(404);
    expect((await ask('/public/hello', KEY)).status).toBe(404);
    expect((await ask('/public', KEY)).status).toBe(404);
  });

  it('never lets a path with dot, empty or encoded segments reach the Public Area', async () => {
    const paths = [
      `/public//${token}/clip.txt`,
      `/public/${token}//clip.txt`,
      `/public/${token}/clip.txt/`,
      `/public/./${token}/clip.txt`,
      `/public/x/../${token}/clip.txt`,
      `/public/${token}/./clip.txt`,
      `/public/${token}%2Fclip.txt`,
      `/public/${token}%2fclip.txt`,
      `/public/${token}/clip%2Etxt`,
      `/public/${token}/clip%2etxt`,
      `/public/${token}%5Cclip.txt`,
      `/public/${token}\\clip.txt`,
      `/public/%2E%2E/${token}/clip.txt`,
      `/public/`,
    ];
    for (const path of paths)
      for (const headers of [{}, KEY])
        expect([path, (await ask(path, headers)).status]).toEqual([path, 404]);
    // A query is not part of the path.
    expect((await ask(`/public/${token}/clip.txt?a=./..`)).status).toBe(200);
  });

  it('streams a Range of a file with 206, and answers HEAD without a body', async () => {
    const path = `/public/${token}/clip.txt`;
    const part = await ask(path, { range: 'bytes=2-5' });
    expect(part).toMatchObject({ status: 206, body: '2345' });
    expect(part.headers).toMatchObject({
      'content-range': 'bytes 2-5/10',
      'content-length': '4',
      'accept-ranges': 'bytes',
      'content-security-policy': 'sandbox',
    });
    const head = await ask(path, {}, 'HEAD');
    expect(head).toMatchObject({ status: 200, body: '' });
    expect(head.headers['content-length']).toBe('10');
    const headPart = await ask(path, { range: 'bytes=7-' }, 'HEAD');
    expect(headPart).toMatchObject({ status: 206, body: '' });
    expect(headPart.headers['content-range']).toBe('bytes 7-9/10');
  });
});
