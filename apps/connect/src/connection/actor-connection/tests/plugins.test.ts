import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import {
  eventually,
  fake,
  folder,
  inputOf,
  KEY,
  PING,
  start,
  upgrade,
  withKey,
} from './fixtures/connection.js';
import { Ping } from './fixtures/ping.js';

/*
 * What a Connection serves: its router, real on a port of the test's own,
 * and its Plugins, a tiny one that answers `ping`.
 */

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
