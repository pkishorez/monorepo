import { join } from 'node:path';
import { Effect, Layer, Stream } from 'effect';
import { RpcClient } from 'effect/rpc';
import { afterEach, describe, expect, it } from 'vitest';
import { client as httpClient } from '@kestack/rpc-toolkit/rpc/http';
import { client as socketClient } from '@kestack/rpc-toolkit/rpc/websocket';
import {
  KEY_HEADER,
  keyProtocols,
  mismatchOf,
  pluginPath,
} from '../http/link/contract/index.js';
import { Downloads } from '../services/downloads/contract/index.js';
import { layer as downloadsLayer } from '../services/downloads/real/index.js';
import { layer as locksLayer } from '../services/locks/real/index.js';
import { Plugins } from '../services/plugins/contract/index.js';
import { layer as pluginsLayer } from '../services/plugins/real/index.js';
import { Server } from '../services/server/contract/index.js';
import { layer as serverLayer } from '../services/server/real/index.js';
import { Echo } from './fixtures/echo.js';
import { cleanUp, folder, releaseOf } from './fixtures/releases.js';

afterEach(cleanUp);

const ORIGINS = ['https://*.kishore.app'];

const services = (cache: string) =>
  Layer.mergeAll(pluginsLayer, serverLayer).pipe(
    Layer.provideMerge(downloadsLayer(cache)),
    Layer.provideMerge(locksLayer),
  );

const runOf = (
  root: string,
  release: { readonly hash: string; readonly url: string },
  name = 'echo',
) => ({
  name,
  release,
  folders: {
    data: join(root, 'data', name),
    state: join(root, 'state', name),
    cache: join(root, 'cache', name),
  },
  socket: join(root, `${name}.sock`),
  logFile: join(root, 'state', `${name}.log`),
});

const linked = Effect.gen(function* () {
  const root = folder();
  const echo = releaseOf('echo.mjs');
  const run = runOf(root, echo);
  const plugins = yield* Plugins;
  yield* plugins.start(run);
  let key = 'first-key';
  const server = yield* Server;
  const port = yield* server.listen({
    port: 0,
    origins: ORIGINS,
    key: () => key,
    route: (name, hash) =>
      name !== 'echo'
        ? null
        : hash === echo.hash
          ? { socket: run.socket }
          : { running: echo.hash },
  });
  return {
    port,
    echo,
    root,
    run,
    rotate: (next: string) => {
      key = next;
    },
    http: `http://127.0.0.1:${port}${pluginPath('echo', echo.hash)}`,
    ws: `ws://127.0.0.1:${port}${pluginPath('echo', echo.hash)}`,
  };
});

const overHttp = (url: string, key: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      httpClient(Echo, { url, headers: { [KEY_HEADER]: key } }),
    );
    return yield* RpcClient.make(Echo).pipe(Effect.provideContext(context));
  });

const overSocket = (url: string, key: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      socketClient(Echo, {
        url,
        protocols: keyProtocols(key),
        retryTransientErrors: false,
      }),
    );
    return yield* RpcClient.make(Echo).pipe(Effect.provideContext(context));
  });

const closeOf = (url: string, protocols: ReadonlyArray<string>) =>
  new Promise<{ code: number; reason: string }>((resolve) => {
    const socket = new WebSocket(url, [...protocols]);
    socket.addEventListener('close', (event) =>
      resolve({ code: event.code, reason: event.reason }),
    );
  });

const live = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    Plugins | Server | Downloads | import('effect').Scope.Scope
  >,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const cache = folder();
        const context = yield* Layer.build(services(cache));
        return yield* effect.pipe(Effect.provideContext(context));
      }),
    ),
  );

describe('a call through the Connection to a Plugin', () => {
  it(
    'reaches the Plugin over HTTP with the key in its header',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const echo = yield* overHttp(at.http, 'first-key');
          expect(yield* echo.echo({ text: 'hi' })).toBe('hi');
          expect(
            Array.from(yield* Stream.runCollect(echo.count({ to: 3 }))),
          ).toEqual([1, 2, 3]);
        }),
      ),
    30_000,
  );

  it(
    'reaches the Plugin over a WebSocket with the key as a subprotocol',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const echo = yield* overSocket(at.ws, 'first-key');
          expect(yield* echo.echo({ text: 'hi' })).toBe('hi');
          expect(
            Array.from(yield* Stream.runCollect(echo.count({ to: 4 }))),
          ).toEqual([1, 2, 3, 4]);
        }),
      ),
    30_000,
  );

  it(
    'keeps an open socket when the key changes, and refuses a new one with the old key',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const echo = yield* overSocket(at.ws, 'first-key');
          expect(yield* echo.echo({ text: 'before' })).toBe('before');
          at.rotate('second-key');
          expect(yield* echo.echo({ text: 'after' })).toBe('after');
          const closed = yield* Effect.promise(() =>
            closeOf(at.ws, keyProtocols('first-key')),
          );
          expect(closed.code).toBe(4401);
          const fresh = yield* overSocket(at.ws, 'second-key');
          expect(yield* fresh.echo({ text: 'new' })).toBe('new');
        }),
      ),
    30_000,
  );

  it(
    'refuses a call without the key, or with an old one',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const none = yield* Effect.promise(() =>
            fetch(at.http, { method: 'POST', body: '' }),
          );
          expect(none.status).toBe(401);
          const old = yield* Effect.promise(() =>
            fetch(at.http, {
              method: 'POST',
              body: '',
              headers: { [KEY_HEADER]: 'old-key' },
            }),
          );
          expect(old.status).toBe(401);
        }),
      ),
    30_000,
  );

  it(
    'says which Release runs when asked for another one',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const other = `http://127.0.0.1:${at.port}${pluginPath('echo', 'f'.repeat(64))}`;
          const answered = yield* Effect.promise(() =>
            fetch(other, {
              method: 'POST',
              body: '',
              headers: { [KEY_HEADER]: 'first-key' },
            }),
          );
          expect(answered.status).toBe(409);
          expect(yield* Effect.promise(() => answered.json())).toMatchObject({
            running: at.echo.hash,
          });
          const closed = yield* Effect.promise(() =>
            closeOf(other.replace('http', 'ws'), keyProtocols('first-key')),
          );
          expect(mismatchOf(closed)).toEqual({ running: at.echo.hash });
        }),
      ),
    30_000,
  );

  it(
    'answers 404 for a Plugin it does not run, and any other path',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const headers = { [KEY_HEADER]: 'first-key' };
          const unknown = yield* Effect.promise(() =>
            fetch(
              `http://127.0.0.1:${at.port}${pluginPath('notes', at.echo.hash)}`,
              { method: 'POST', body: '', headers },
            ),
          );
          expect(unknown.status).toBe(404);
          const other = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${at.port}/echo/static/index.html`, {
              headers,
            }),
          );
          expect(other.status).toBe(404);
        }),
      ),
    30_000,
  );

  it(
    'answers its health without a key, for the reachability check',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const health = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${at.port}/health`),
          );
          expect(health.status).toBe(200);
        }),
      ),
    30_000,
  );

  it(
    'lets in only pages from the allowed origins, answering their preflight',
    () =>
      live(
        Effect.gen(function* () {
          const at = yield* linked;
          const preflight = yield* Effect.promise(() =>
            fetch(at.http, {
              method: 'OPTIONS',
              headers: { origin: 'https://code.kishore.app' },
            }),
          );
          expect(preflight.status).toBe(204);
          expect(
            preflight.headers.get('access-control-allow-headers'),
          ).toContain(KEY_HEADER);
          const foreign = yield* Effect.promise(() =>
            fetch(at.http, {
              method: 'POST',
              body: '',
              headers: {
                origin: 'https://evil.example',
                [KEY_HEADER]: 'first-key',
              },
            }),
          );
          expect(foreign.status).toBe(403);
        }),
      ),
    30_000,
  );
});

describe('a Plugin process', () => {
  it(
    'keeps its data across a restart of a new Release',
    () =>
      live(
        Effect.gen(function* () {
          const root = folder();
          const plugins = yield* Plugins;
          const server = yield* Server;
          let release = releaseOf('echo.mjs');
          const run = () => runOf(root, release);
          const port = yield* server.listen({
            port: 0,
            origins: [],
            key: () => 'k',
            route: () => ({ socket: run().socket }),
          });
          const remember = (text: string) =>
            Effect.scoped(
              Effect.gen(function* () {
                yield* plugins.start(run());
                const echo = yield* overHttp(
                  `http://127.0.0.1:${port}${pluginPath('echo', release.hash)}`,
                  'k',
                );
                return yield* echo.remember({ text });
              }),
            );
          expect(yield* remember('first')).toEqual(['first']);
          release = releaseOf('echo.mjs', '// v2\n');
          expect(yield* remember('second')).toEqual(['first', 'second']);
        }),
      ),
    60_000,
  );

  it(
    'never shows the Plugin the key',
    () =>
      live(
        Effect.gen(function* () {
          const root = folder();
          const run = runOf(root, releaseOf('headers.mjs'), 'headers');
          yield* (yield* Plugins).start(run);
          const port = yield* (yield* Server).listen({
            port: 0,
            origins: [],
            key: () => 'secret',
            route: () => ({ socket: run.socket }),
          });
          const answered = yield* Effect.promise(() =>
            fetch(
              `http://127.0.0.1:${port}${pluginPath('headers', run.release.hash)}?x=1`,
              {
                method: 'POST',
                body: '{}',
                headers: { [KEY_HEADER]: 'secret' },
              },
            ).then((response) => response.json()),
          );
          expect(answered.path).toBe('/rpc?x=1');
          expect(JSON.stringify(answered.headers)).not.toContain('secret');
        }),
      ),
    30_000,
  );

  it(
    'answers 503 while the Plugin is not listening yet',
    () =>
      live(
        Effect.gen(function* () {
          const root = folder();
          const port = yield* (yield* Server).listen({
            port: 0,
            origins: [],
            key: () => 'k',
            route: () => ({ socket: join(root, 'nobody.sock') }),
          });
          const answered = yield* Effect.promise(() =>
            fetch(
              `http://127.0.0.1:${port}${pluginPath('echo', 'a'.repeat(64))}`,
              {
                method: 'POST',
                body: '',
                headers: { [KEY_HEADER]: 'k' },
              },
            ),
          );
          expect(answered.status).toBe(503);
        }),
      ),
    30_000,
  );

  it(
    'fails to start, with its last lines, when it exits before it is ready',
    () =>
      live(
        Effect.gen(function* () {
          const root = folder();
          const failed = yield* Effect.flip(
            (yield* Plugins).start(
              runOf(root, releaseOf('crash.mjs'), 'crash'),
            ),
          );
          expect(failed.message).toMatch(/exited with 3 before it was ready/);
          expect(failed.log).toEqual(
            expect.arrayContaining(['starting up', 'cannot read the config']),
          );
        }),
      ),
    30_000,
  );

  it(
    'refuses a file that is not the Release asked for',
    () =>
      live(
        Effect.gen(function* () {
          const root = folder();
          const real = releaseOf('echo.mjs');
          const failed = yield* Effect.flip(
            (yield* Plugins).start(
              runOf(root, { hash: 'b'.repeat(64), url: real.url }),
            ),
          );
          expect(failed.message).toMatch(/is not the Plugin asked for/);
        }),
      ),
    30_000,
  );

  it(
    'stops the process when its Scope closes',
    () =>
      live(
        Effect.gen(function* () {
          const root = folder();
          const run = runOf(root, releaseOf('echo.mjs'));
          const server = yield* Server;
          const port = yield* server.listen({
            port: 0,
            origins: [],
            key: () => 'k',
            route: () => ({ socket: run.socket }),
          });
          yield* Effect.scoped((yield* Plugins).start(run));
          const answered = yield* Effect.promise(() =>
            fetch(
              `http://127.0.0.1:${port}${pluginPath('echo', run.release.hash)}`,
              {
                method: 'POST',
                body: '',
                headers: { [KEY_HEADER]: 'k' },
              },
            ),
          );
          expect(answered.status).toBe(503);
        }),
      ),
    30_000,
  );
});
