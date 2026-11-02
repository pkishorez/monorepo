import { mkdtempSync, rmSync } from 'node:fs';
import {
  createServer,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  request,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, type Scope } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { pluginPath, publicPath } from '../../../../cloud/contract/index.js';
import { router } from '../router.js';

/*
 * The router alone, on a port of the test's own, in front of a fake Plugin
 * on a socket that answers every request, plain or upgrade, with what it
 * was asked: its method, path, how it came in, and its subprotocols.
 */

const KEY = 'k3y_-secret';
const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const withKey = { 'sec-websocket-protocol': `ke-connect, key.${KEY}` };

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly access: ReadonlyArray<string>;
  readonly protocol: string | null;
}

const seenOf = (
  method: string | undefined,
  url: string | undefined,
  raw: ReadonlyArray<string>,
  headers: IncomingHttpHeaders,
): Seen => {
  const access: Array<string> = [];
  for (let at = 0; at < raw.length; at += 2)
    if (raw[at]!.toLowerCase() === 'x-ke-connect-access')
      access.push(raw[at + 1]!);
  return {
    method: method ?? '',
    url: url ?? '',
    access,
    protocol: (headers['sec-websocket-protocol'] as string) ?? null,
  };
};

const made: Array<string> = [];
afterEach(() => {
  for (const folder of made.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

/** A fake Plugin on a socket of its own, for as long as the Scope. */
const plugin = Effect.acquireRelease(
  Effect.callback<{ socket: string; close: () => void }>((resume) => {
    const folder = mkdtempSync(join(tmpdir(), 'rt-'));
    made.push(folder);
    const socket = join(folder, 'p.sock');
    const server = createServer((asked, answered) => {
      answered.writeHead(200, { 'content-type': 'application/json' });
      answered.end(
        JSON.stringify(
          seenOf(asked.method, asked.url, asked.rawHeaders, asked.headers),
        ),
      );
    });
    server.on('upgrade', (asked, raw) => {
      const seen = JSON.stringify(
        seenOf(asked.method, asked.url, asked.rawHeaders, asked.headers),
      );
      raw.end(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `X-Seen: ${Buffer.from(seen).toString('base64')}\r\n\r\n`,
      );
    });
    server.listen(socket, () =>
      resume(
        Effect.succeed({
          socket,
          close: () => {
            server.closeAllConnections();
            server.close();
          },
        }),
      ),
    );
  }),
  ({ close }) => Effect.sync(close),
);

/** The router in front of the fake Plugin `files`, which runs the Release HASH: its port. */
const start = (running: string | null = HASH) =>
  Effect.gen(function* () {
    const { socket } = yield* plugin;
    return yield* router({
      port: 0,
      key: KEY,
      origins: ['https://*.app.test'],
      socketOf: (name) => (name === 'files' ? socket : null),
      otherThan: (_, hash) => (hash === running ? undefined : running),
    });
  });

type Answer =
  | { readonly status: number; readonly seen: Seen }
  | { readonly status: number; readonly body: string };

/** How the router answers a plain GET at `path`: what the Plugin saw, or the router's own answer. */
const get = (port: number, path: string, headers: OutgoingHttpHeaders = {}) =>
  Effect.promise(
    () =>
      new Promise<Answer>((resolve, reject) => {
        const asking = request({
          host: '127.0.0.1',
          port,
          path,
          agent: false,
          headers,
        });
        asking.on('response', (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => (body += chunk));
          response.on('end', () => {
            const status = response.statusCode ?? 0;
            const fromPlugin =
              status === 200 &&
              response.headers['content-type'] === 'application/json';
            resolve(
              fromPlugin
                ? { status, seen: JSON.parse(body) as Seen }
                : { status, body },
            );
          });
        });
        asking.on('error', reject);
        asking.end();
      }),
  );

/** How the router answers a WebSocket upgrade at `path`: what the Plugin saw, or the router's refusal. */
const upgrade = (
  port: number,
  path: string,
  headers: OutgoingHttpHeaders = {},
) =>
  Effect.promise(
    () =>
      new Promise<Answer>((resolve, reject) => {
        const asking = request({
          host: '127.0.0.1',
          port,
          path,
          agent: false,
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-version': '13',
            'sec-websocket-key':
              Buffer.from('0123456789abcdef').toString('base64'),
            ...headers,
          },
        });
        asking.on('upgrade', (response, socket) => {
          socket.destroy();
          const seen = Buffer.from(
            response.headers['x-seen'] as string,
            'base64',
          ).toString('utf8');
          resolve({ status: 101, seen: JSON.parse(seen) as Seen });
        });
        asking.on('response', (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => (body += chunk));
          response.on('end', () =>
            resolve({ status: response.statusCode ?? 0, body }),
          );
        });
        asking.on('error', reject);
        asking.end();
      }),
  );

const run = (test: Effect.Effect<void, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(test));

describe('the router', () => {
  it('passes /<plugin>/<sha256>/<rest> to the Plugin as /<rest>, query kept, with the key and the Release it runs', () =>
    run(
      Effect.gen(function* () {
        const port = yield* start();
        expect(
          yield* get(port, `/files/${HASH}/ticket/a.png?x=1`, withKey),
        ).toEqual({
          status: 200,
          seen: {
            method: 'GET',
            url: '/ticket/a.png?x=1',
            access: ['key'],
            protocol: 'ke-connect',
          },
        });
        expect(
          yield* upgrade(port, pluginPath('files', HASH), withKey),
        ).toEqual({
          status: 101,
          seen: {
            method: 'GET',
            url: '/rpc',
            access: ['key'],
            protocol: 'ke-connect',
          },
        });
        // Without the key, or at another Release, it never reaches the Plugin.
        expect((yield* get(port, `/files/${HASH}/ticket/a.png`)).status).toBe(
          401,
        );
        expect(
          (yield* get(port, `/files/${OTHER}/ticket/a.png`, withKey)).status,
        ).toBe(409);
        expect((yield* get(port, `/files/${HASH}/`, withKey)).status).toBe(404);
        expect((yield* get(port, `/nope/${HASH}/rpc`, withKey)).status).toBe(
          404,
        );
      }),
    ));

  it('passes /<plugin>/public/<rest> as /public/<rest> without the key, at whatever Release runs', () =>
    run(
      Effect.gen(function* () {
        const port = yield* start(null);
        const path = publicPath('files', 'ticket/t0k3n/report%20one.pdf');
        expect(path).toBe('/files/public/ticket/t0k3n/report%20one.pdf');
        expect(yield* get(port, `${path}?download=1`)).toEqual({
          status: 200,
          seen: {
            method: 'GET',
            url: '/public/ticket/t0k3n/report%20one.pdf?download=1',
            access: ['public'],
            protocol: null,
          },
        });
        // A key sent anyway is never passed on.
        expect(yield* get(port, path, withKey)).toMatchObject({
          seen: { access: ['public'], protocol: 'ke-connect' },
        });
        // An allowed page's origin passes; any other, `null` included, does not.
        expect(
          (yield* get(port, path, { origin: 'https://code.app.test' })).status,
        ).toBe(200);
        for (const origin of ['https://evil.com', 'null'])
          expect((yield* get(port, path, { origin })).status).toBe(403);
        expect((yield* get(port, '/nope/public/x')).status).toBe(404);
      }),
    ));

  it('takes no WebSocket in a Public Area', () =>
    run(
      Effect.gen(function* () {
        const port = yield* start();
        for (const headers of [{}, withKey])
          expect(
            (yield* upgrade(port, publicPath('files', 'socket'), headers))
              .status,
          ).toBe(400);
      }),
    ));

  it('passes no other spelling of a Public Area, so none skips the key', () =>
    run(
      Effect.gen(function* () {
        const port = yield* start();
        for (const path of [
          '/files/public',
          '/files/public/',
          '/files/public//x',
          '/files/public/x/',
          '//files/public/x',
          '/files//public/x',
          '/FILES/public/x',
          '/files/PUBLIC/x',
          '/files/Public/x',
          '/files/%70ublic/x',
          '/files/public%2fx',
          '/files/public/.',
          '/files/public/..',
          '/files/public/../rpc',
          '/files/public/./x',
          '/files/public/x/../../rpc',
          '/files/public/%2e%2e/rpc',
          '/files/public/%2E%2E/rpc',
          '/files/public/.%2e/rpc',
          '/files/public/x%2f..%2f..%2frpc',
          '/files/public/x%2F..%2F..%2Frpc',
          '/files/public/x%5c..%5c..%5crpc',
          '/files/public/x%5C..',
          '/files/public/x\\..\\..\\rpc',
          '/files/public/x#/../../rpc',
          `/files/public/../${HASH}/rpc`,
        ]) {
          // Without the key it is refused, and with it, it names nothing.
          expect({ path, status: (yield* get(port, path)).status }).toEqual({
            path,
            status: 401,
          });
          expect({
            path,
            status: (yield* get(port, path, withKey)).status,
          }).toEqual({ path, status: 404 });
        }
      }),
    ));

  it('tells the Plugin how a request came in, whatever the caller said', () =>
    run(
      Effect.gen(function* () {
        const port = yield* start();
        const lies = {
          'x-ke-connect-access': 'key',
          'X-KE-Connect-Access': ['key', 'key'],
        };
        expect(yield* get(port, publicPath('files', 'x'), lies)).toMatchObject({
          seen: { access: ['public'] },
        });
        expect(
          yield* get(port, `/files/${HASH}/x`, {
            ...withKey,
            'x-ke-connect-access': 'public',
          }),
        ).toMatchObject({ seen: { access: ['key'] } });
        expect(
          yield* upgrade(port, pluginPath('files', HASH), {
            ...withKey,
            ...lies,
            'x-ke-connect-access': 'public',
          }),
        ).toMatchObject({ seen: { access: ['key'] } });
      }),
    ));
});
