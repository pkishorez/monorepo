import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import {
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginPath,
} from '../../../cloud/contract/index.js';
import {
  closeOf,
  eventually,
  fake,
  folder,
  get,
  KEY,
  release,
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
          // No such Plugin.
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
    'starts the Plugins Cloud Connect wants, reports where each stands, and passes no other path',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host, plugins } = fake({
              healthy: () => true,
              answer: () => ({ _tag: 'Reported', wanted: { ping } }),
            });
            const { root } = yield* start(host);
            yield* eventually(
              () => expect(root().model.plugins['ping']?._tag).toBe('Running'),
              20_000,
            );
            const port = root().model.listening!;
            for (const path of [
              '/ping/rpc',
              '/ping/control',
              `/ping/${ping.hash}`,
            ])
              expect(
                yield* Effect.promise(() => upgrade(port, path, withKey)),
              ).toBe(404);
            yield* eventually(() =>
              expect(plugins.at(-1)).toEqual({
                ping: { _tag: 'Running', hash: ping.hash },
              }),
            );
          }),
        ),
      ),
    30_000,
  );

  it(
    'passes /<plugin>/<sha256>/rpc to the Release it runs, and closes any other with 4409, saying which runs',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const other = release('// another\n').hash;
            const { host } = fake({
              healthy: () => true,
              answer: () => ({ _tag: 'Reported', wanted: { ping } }),
            });
            const { root } = yield* start(host);
            yield* eventually(
              () =>
                expect(root().model.plugins['ping']).toEqual({
                  _tag: 'Running',
                  hash: ping.hash,
                }),
              20_000,
            );
            const port = root().model.listening!;
            const context = yield* Layer.build(
              client(Ping, {
                url: `ws://127.0.0.1:${port}${pluginPath('ping', ping.hash)}`,
                protocols: ['ke-connect', `key.${KEY}`],
              }),
            );
            const api = yield* Effect.provideContext(
              RpcClient.make(Ping),
              context,
            );
            expect(yield* api.ping()).toBe('pong');
            expect(
              yield* Effect.promise(() =>
                closeOf(port, pluginPath('ping', other)),
              ),
            ).toEqual({
              code: PLUGIN_MISMATCH,
              reason: mismatchReason(ping.hash),
            });
            expect(
              yield* Effect.promise(() => get(port, pluginPath('ping', other))),
            ).toEqual({ status: 409, body: mismatchReason(ping.hash) });
            // Without the key, it is refused before any hash is read.
            expect(
              yield* Effect.promise(() =>
                upgrade(port, pluginPath('ping', other)),
              ),
            ).toBe(401);
          }),
        ),
      ),
    30_000,
  );

  it('closes with 4409 and no hash while the Plugin runs none yet', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const missing = {
            hash: 'a'.repeat(64),
            url: pathToFileURL(join(folder(), 'gone.mjs')).href,
          };
          const { host } = fake({
            healthy: () => true,
            answer: () => ({ _tag: 'Reported', wanted: { ping: missing } }),
          });
          const { root } = yield* start(host);
          yield* eventually(() =>
            expect(root().model.plugins['ping']?._tag).toBe('Crashed'),
          );
          const port = root().model.listening!;
          expect(
            yield* Effect.promise(() =>
              closeOf(port, pluginPath('ping', missing.hash)),
            ),
          ).toEqual({ code: PLUGIN_MISMATCH, reason: mismatchReason(null) });
          expect(root().model.plugins['ping']).toMatchObject({
            log: [`ping ${missing.hash} isn't on the shelf; run the build`],
          });
        }),
      ),
    ));
});
