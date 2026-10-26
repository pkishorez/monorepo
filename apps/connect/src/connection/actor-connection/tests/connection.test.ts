import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Duration, Effect, Layer, Option, Stream } from 'effect';
import { RpcClient } from 'effect/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads, socketPath } from '@kestack/cli-platform/files';
import { reach } from '@kestack/cli-platform/single';
import type { PluginState } from '@kestack/cli-platform/plugins';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import {
  addressOf,
  type ConnectionStatus,
} from '../../../cloud/contract/index.js';
import {
  ActorConnection,
  ConnectionControl,
  ConnectionHost,
  type Reported,
} from '../index.js';
import { Ping } from './fixtures/ping.js';

/*
 * A Connection against a fake tunnel, whose addresses are numbered by how
 * many times one was opened, and a fake Cloud Connect that records each
 * Report. Its router and control socket are real, on a port and a runtime
 * folder of the test's own, and so are its Plugins: a tiny one that answers
 * `ping`.
 */

const PING = fileURLToPath(new URL('./fixtures/ping.mjs', import.meta.url));
const KEY = 'k3y_-secret';

const made: Array<string> = [];
afterEach(() => {
  for (const folder of made.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
const folder = () => {
  const at = mkdtempSync(join(tmpdir(), 'connect-'));
  made.push(at);
  return at;
};

const fake = (options: {
  readonly healthy: (url: string) => boolean;
  readonly answer?: (status: ConnectionStatus, count: number) => Reported;
  readonly signInAgain?: Effect.Effect<void, string>;
  readonly backoff?: Duration.Input;
  /** How getting cloudflared goes; at once unless given. */
  readonly cloudflared?: Effect.Effect<string, Error>;
}) => {
  const opened: Array<string> = [];
  const closed: Array<string> = [];
  const ports: Array<number> = [];
  const reports: Array<ConnectionStatus> = [];
  const plugins: Array<Readonly<Record<string, PluginState>>> = [];
  const signIns: Array<number> = [];
  const host = ConnectionHost.of({
    every: '10 millis',
    cloudflared: options.cloudflared ?? Effect.succeed('/bin/cloudflared'),
    open: (port) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const url = `https://t${opened.length + 1}.example`;
          opened.push(url);
          ports.push(port);
          return { url, closed: Effect.never };
        }),
        ({ url }) => Effect.sync(() => void closed.push(url)),
      ),
    check: (url: string) =>
      Effect.succeed({
        ok: options.healthy(url),
        at: Date.now(),
        problem: options.healthy(url) ? null : 'down',
      }),
    report: (report) =>
      Effect.sync(() => {
        reports.push(report.status);
        plugins.push(report.plugins);
        return (
          options.answer?.(report.status, reports.length) ?? {
            _tag: 'Reported',
            wanted: {},
          }
        );
      }),
    backoff: options.backoff ?? '10 millis',
    signInAgain: Effect.suspend(() => {
      signIns.push(Date.now());
      return options.signInAgain ?? Effect.void;
    }),
  });
  return {
    host,
    opened,
    closed,
    ports,
    reports,
    plugins,
    signIns: () => signIns.length,
    signedInAt: signIns,
  };
};

/** The Input of a Connection with folders of its own. */
const inputOf = (files: Record<string, string> = {}) => {
  const root = folder();
  const runtime = folder();
  const socketId = 'c0ffee00';
  return {
    id: 'connection-1',
    name: 'test',
    key: KEY,
    folders: {
      data: join(root, 'data'),
      state: join(root, 'state'),
      cache: join(root, 'cache'),
      runtime,
    },
    socketId,
    control: socketPath(runtime, socketId, 'connect'),
    port: 0,
    origins: ['http://localhost:*', 'https://*.app.test'],
    files,
  };
};

/** Runs a Connection on `host` until it ends, for as long as the Scope: how it ended, and its root. */
const start = (
  host: ConnectionHost['Service'],
  input: ReturnType<typeof inputOf> = inputOf(),
) =>
  Effect.gen(function* () {
    const running = yield* Runtime.start(
      History.make(ActorConnection, { window: 0, input }),
      Layer.merge(
        Layer.succeed(ConnectionHost, host),
        Downloads.layer(input.folders.cache),
      ),
    );
    const root = () => running.instance({ from: 'test' });
    const ended = running.changes.pipe(
      Stream.map(() => root().state),
      Stream.merge(Stream.sync(() => root().state)),
      Stream.filter(
        (state) => state._tag === 'Forgotten' || state._tag === 'Stopped',
      ),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
    return { ended, root, input };
  });

/** Runs a Connection on `host` until it ends: how it ended. */
const runToEnd = (host: ConnectionHost['Service']) =>
  Effect.scoped(Effect.flatMap(start(host), ({ ended }) => ended));

const eventually = (assertion: () => void, timeout = 5_000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 10 }));

/** How the router answers a WebSocket upgrade at `path`: 101, or its refusal. */
const upgrade = (
  port: number,
  path: string,
  headers: Record<string, string> = {},
) =>
  new Promise<number>((resolve, reject) => {
    const asking = request({
      host: '127.0.0.1',
      port,
      path,
      agent: false,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('0123456789abcdef').toString('base64'),
        ...headers,
      },
    });
    asking.on('upgrade', (_, socket) => {
      socket.destroy();
      resolve(101);
    });
    asking.on('response', (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    asking.on('error', reject);
    asking.end();
  });

const withKey = { 'sec-websocket-protocol': `ke-connect, key.${KEY}` };

describe('a Connection', () => {
  it('reports cloudflared downloading, then the tunnel opening, then up, at the router’s port', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, reports, ports } = fake({
            healthy: () => true,
            cloudflared: Effect.as(
              Effect.sleep('700 millis'),
              '/bin/cloudflared',
            ),
          });
          const { root } = yield* start(host);
          yield* eventually(() =>
            expect(reports.at(-1)?._tag).toBe('Reachable'),
          );
          const tags = reports.map(({ _tag }) => _tag).join(',');
          // Opening at first, until getting cloudflared takes a while.
          expect(tags).toMatch(
            /^(Opening,)*(Installing,)+Opening,.*Reachable$/,
          );
          expect(ports).toEqual([root().model.listening]);
          expect(ports[0]).toBeGreaterThan(0);
        }),
      ),
    ));

  it('reports why the tunnel could not open', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, reports } = fake({
            healthy: () => true,
            cloudflared: Effect.fail(new Error('download timed out')),
          });
          yield* start(host);
          yield* eventually(() =>
            expect(reports).toContainEqual(
              expect.objectContaining({
                _tag: 'OpenFailed',
                problem: 'download timed out',
              }),
            ),
          );
        }),
      ),
    ));

  it('restarts the tunnel after three failed checks in a row, and reports the new address', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, opened, closed, reports } = fake({
            healthy: (url) => url !== 'https://t1.example',
          });
          yield* start(host);
          yield* eventually(() =>
            expect(
              reports.some(
                (report) => addressOf(report) === 'https://t2.example',
              ),
            ).toBe(true),
          );
          expect(opened).toEqual(['https://t1.example', 'https://t2.example']);
          expect(closed).toEqual(['https://t1.example']);
          const failures = reports.filter(
            (report) =>
              report._tag === 'Unreachable' &&
              report.url === 'https://t1.example',
          );
          expect(failures.length).toBe(2);
        }),
      ),
    ));

  it('keeps the tunnel while checks fail fewer than three times in a row', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let checks = 0;
          const { host, opened, reports } = fake({
            healthy: () => checks++ % 2 === 0,
          });
          yield* start(host);
          yield* eventually(() => expect(reports.length).toBeGreaterThan(10));
          expect(opened).toEqual(['https://t1.example']);
        }),
      ),
    ));

  it('ends Forgotten when Cloud Connect forgot the Connection', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { host, closed } = fake({
          healthy: () => true,
          answer: (_, count) =>
            count >= 3
              ? { _tag: 'Forgotten' }
              : { _tag: 'Reported', wanted: {} },
        });
        expect(yield* runToEnd(host)).toEqual({ _tag: 'Forgotten' });
        yield* eventually(() => expect(closed).toEqual(['https://t1.example']));
      }),
    ));

  it('closes the tunnel when signed out, and opens a new one once signed in again', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let signedOut = false;
          const { host, opened, closed, reports, signIns } = fake({
            healthy: () => true,
            answer: (report) => {
              if (addressOf(report) === 'https://t1.example' && !signedOut) {
                signedOut = true;
                return { _tag: 'SignedOut' };
              }
              return { _tag: 'Reported', wanted: {} };
            },
          });
          yield* start(host);
          yield* eventually(() =>
            expect(
              reports.some(
                (report) => addressOf(report) === 'https://t2.example',
              ),
            ).toBe(true),
          );
          expect(signIns()).toBe(1);
          expect(opened).toEqual(['https://t1.example', 'https://t2.example']);
          expect(closed).toContain('https://t1.example');
        }),
      ),
    ));

  it('backs off, longer each time, while Cloud Connect refuses every new Sign-in', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, signedInAt } = fake({
            healthy: () => true,
            answer: () => ({ _tag: 'SignedOut' }),
            backoff: '20 millis',
          });
          yield* start(host);
          // Waits of 0, 20, 40, 80 and 160 ms: five Sign-ins by 300 ms.
          yield* eventually(() => expect(signedInAt.length).toBe(5));
          yield* Effect.sleep('100 millis');
          expect(signedInAt.length).toBe(5);
          const gaps = signedInAt.slice(1).map((at, i) => at - signedInAt[i]!);
          expect(gaps[3]!).toBeGreaterThanOrEqual(160);
          expect(gaps[3]!).toBeGreaterThan(gaps[1]! * 2);
        }),
      ),
    ));

  it('signs in again at once after a Report was taken since the last refusal', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let refusals = 0;
          let taken = false;
          const { host, signIns } = fake({
            healthy: () => true,
            answer: (report) => {
              if (refusals === 0 || (taken && refusals === 1)) {
                refusals++;
                return { _tag: 'SignedOut' };
              }
              // Taken from the tunnel opened once signed in again.
              if (addressOf(report) !== null) taken = true;
              return { _tag: 'Reported', wanted: {} };
            },
            backoff: '1 minute',
          });
          yield* start(host);
          yield* eventually(() => expect(signIns()).toBe(2));
        }),
      ),
    ));

  it('stops when signing in again fails, or Cloud Connect refuses the Connection', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const signedOut = fake({
          healthy: () => true,
          answer: () => ({ _tag: 'SignedOut' }),
          signInAgain: Effect.fail('someone else'),
        });
        expect(yield* runToEnd(signedOut.host)).toEqual({
          _tag: 'Stopped',
          reason: 'someone else',
        });
        const refused = fake({
          healthy: () => true,
          answer: () => ({ _tag: 'Refused', reason: 'taken' }),
        });
        expect(yield* runToEnd(refused.host)).toEqual({
          _tag: 'Stopped',
          reason: 'taken',
        });
      }),
    ));
});

describe('its router', () => {
  it('asks for the Connection Key everywhere but /health, and lets in only the origins given', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host } = fake({ healthy: () => true });
          const { root } = yield* start(host);
          yield* eventually(() =>
            expect(root().model.listening).not.toBeNull(),
          );
          const port = root().model.listening!;
          const status = (path: string, headers?: Record<string, string>) =>
            Effect.promise(() => upgrade(port, path, headers));
          expect(yield* status('/ping/rpc')).toBe(401);
          expect(
            yield* status('/ping/rpc', {
              'sec-websocket-protocol': 'ke-connect',
            }),
          ).toBe(401);
          expect(
            yield* status('/ping/rpc', {
              'sec-websocket-protocol': 'ke-connect, key.wrong',
            }),
          ).toBe(403);
          // No other spelling of a path skips the key.
          for (const path of ['/HEALTH', '//health', '/%68ealth', '/health/'])
            expect(yield* status(path)).toBe(401);
          expect(
            yield* status('/ping/rpc', {
              ...withKey,
              origin: 'https://evil.com',
            }),
          ).toBe(403);
          // No such Plugin, and a Plugin's own control path.
          expect(yield* status('/nope/rpc', withKey)).toBe(404);
          const health = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/health`),
          );
          expect(health.status).toBe(200);
          const evil = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/health`, {
              headers: { origin: 'https://evil.com' },
            }),
          );
          expect(evil.status).toBe(403);
        }),
      ),
    ));

  it(
    'starts the Plugins Cloud Connect wants, passes /<plugin>/rpc to each, and reports where each stands',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const { host, plugins } = fake({ healthy: () => true });
            const { root } = yield* start(host, inputOf({ ping: PING }));
            yield* eventually(
              () => expect(root().model.plugins['ping']?._tag).toBe('Running'),
              20_000,
            );
            const port = root().model.listening!;
            expect(
              yield* Effect.promise(() =>
                upgrade(port, '/ping/control', withKey),
              ),
            ).toBe(404);
            const context = yield* Layer.build(
              client(Ping, {
                url: `ws://127.0.0.1:${port}/ping/rpc`,
                protocols: ['ke-connect', `key.${KEY}`],
              }),
            );
            const api = yield* Effect.provideContext(
              RpcClient.make(Ping),
              context,
            );
            expect(yield* api.ping()).toBe('pong');
            yield* eventually(() =>
              expect(plugins.at(-1)).toEqual({
                ping: { _tag: 'Running', hash: PING },
              }),
            );
          }),
        ),
      ),
    30_000,
  );

  it('answers 503 while a Plugin is not listening yet', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host } = fake({ healthy: () => true });
          const { root } = yield* start(
            host,
            inputOf({ slow: join(folder(), 'missing.mjs') }),
          );
          yield* eventually(() =>
            expect(root().model.listening).not.toBeNull(),
          );
          expect(
            yield* Effect.promise(() =>
              upgrade(root().model.listening!, '/slow/rpc', withKey),
            ),
          ).toBe(503);
        }),
      ),
    ));
});

describe('its control socket', () => {
  it('says how it stands, stops it, and is held by one Connection of a name at a time', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const input = inputOf();
          const { host } = fake({ healthy: () => true });
          const first = yield* start(host, input);
          yield* eventually(() =>
            expect(first.root().model.status._tag).toBe('Reachable'),
          );
          const control = yield* reach(input.control, ConnectionControl);
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: 'connection-1',
            url: 'https://t1.example',
            plugins: {},
          });

          const second = yield* start(
            fake({ healthy: () => true }).host,
            input,
          );
          expect(yield* second.ended).toEqual({
            _tag: 'Stopped',
            reason: 'test is already running',
          });

          yield* Effect.forkScoped(control.stop());
          expect(yield* first.ended).toEqual({ _tag: 'Stopped', reason: null });
        }),
      ),
    ));
});
