import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import {
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginPath,
} from '../../../../../contract/index.js';
import {
  closeOf,
  eventually,
  fake,
  folder,
  get,
  release,
  start,
  upgrade,
  withKey,
} from './fixtures/connection.js';
import { Ping } from './fixtures/ping.js';

/*
 * What a Connection serves: its server, real on a port of the test's own,
 * and its Plugins, a tiny one that answers `ping`.
 */

describe('its server', () => {
  it('asks for the Connection Key everywhere but /health, and lets in only the origins given', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host } = fake({ healthy: () => true });
          const { root, listening } = yield* start(host);
          yield* eventually(() => expect(root().state._tag).toBe('Listening'));
          const { port, key } = listening();
          const status = (path: string, headers?: Record<string, string>) =>
            Effect.promise(() => upgrade(port, path, headers));
          expect(yield* status('/ping/rpc')).toBe(401);
          expect(
            yield* status('/ping/rpc', {
              'sec-websocket-protocol': 'ke-connect',
            }),
          ).toBe(401);
          // No other spelling of a path skips the key.
          for (const path of ['/HEALTH', '//health', '/%68ealth', '/health/'])
            expect(yield* status(path)).toBe(401);
          expect(
            yield* status('/ping/rpc', {
              ...withKey(key),
              origin: 'https://evil.com',
            }),
          ).toBe(403);
          // No such Plugin.
          expect(yield* status('/nope/rpc', withKey(key))).toBe(404);
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
    'starts the Plugins Connect Cloud wants, keeps where each stands, and passes no other path',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host } = fake({
              healthy: () => true,
              answer: () => ({ ping }),
            });
            const { root, listening } = yield* start(host);
            yield* eventually(
              () => expect(root().model.plugins['ping']?._tag).toBe('Running'),
              20_000,
            );
            const { port, key } = listening();
            for (const path of [
              '/ping/rpc',
              '/ping/control',
              `/ping/${ping.hash}`,
            ])
              expect(
                yield* Effect.promise(() => upgrade(port, path, withKey(key))),
              ).toBe(404);
            expect(root().model.plugins).toEqual({
              ping: { _tag: 'Running', hash: ping.hash },
            });
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
              answer: () => ({ ping }),
            });
            const { root, listening } = yield* start(host);
            yield* eventually(
              () =>
                expect(root().model.plugins['ping']).toEqual({
                  _tag: 'Running',
                  hash: ping.hash,
                }),
              20_000,
            );
            const { port, key } = listening();
            const context = yield* Layer.build(
              client(Ping, {
                url: `ws://127.0.0.1:${port}${pluginPath('ping', ping.hash)}`,
                protocols: ['ke-connect', `key.${key}`],
              }),
            );
            const api = yield* Effect.provideContext(
              RpcClient.make(Ping),
              context,
            );
            expect(yield* api.ping()).toBe('pong');
            expect(
              yield* Effect.promise(() =>
                closeOf(port, pluginPath('ping', other), key),
              ),
            ).toEqual({
              code: PLUGIN_MISMATCH,
              reason: mismatchReason(ping.hash),
            });
            expect(
              yield* Effect.promise(() =>
                get(port, pluginPath('ping', other), withKey(key)),
              ),
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

  it(
    'keeps passing the Release it runs while the next one downloads, and closes it only once that one runs',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const next = release('// next\n');
            const content = readFileSync(fileURLToPath(next.url));
            // The next Release's file, half sent until the test lets it go.
            let letGo = () => {};
            const held = new Promise<void>((done) => (letGo = done));
            let downloading = false;
            const files = createServer((_, response) => {
              downloading = true;
              response.writeHead(200, { 'content-length': content.length });
              response.write(content.subarray(0, 10));
              void held.then(() => response.end(content.subarray(10)));
            });
            yield* Effect.acquireRelease(
              Effect.promise(
                () =>
                  new Promise<void>((done) =>
                    files.listen(0, '127.0.0.1', () => done()),
                  ),
              ),
              () => Effect.sync(() => files.close()),
            );
            const at = `http://127.0.0.1:${(files.address() as AddressInfo).port}/next.mjs`;
            let wanted = ping;
            const { host } = fake({
              healthy: () => true,
              answer: () => ({ ping: wanted }),
            });
            const { root, listening } = yield* start(host);
            yield* eventually(
              () =>
                expect(root().model.plugins['ping']).toEqual({
                  _tag: 'Running',
                  hash: ping.hash,
                }),
              20_000,
            );
            const { port, key } = listening();
            wanted = { hash: next.hash, url: at };
            yield* eventually(() => expect(downloading).toBe(true), 20_000);
            // The Release before is still the one running: passed.
            const context = yield* Layer.build(
              client(Ping, {
                url: `ws://127.0.0.1:${port}${pluginPath('ping', ping.hash)}`,
                protocols: ['ke-connect', `key.${key}`],
              }),
            );
            const api = yield* Effect.provideContext(
              RpcClient.make(Ping),
              context,
            );
            expect(yield* api.ping()).toBe('pong');
            expect(
              yield* Effect.promise(() =>
                closeOf(port, pluginPath('ping', next.hash), key),
              ),
            ).toEqual({
              code: PLUGIN_MISMATCH,
              reason: mismatchReason(ping.hash),
            });
            letGo();
            yield* eventually(
              () =>
                expect(root().model.plugins['ping']).toEqual({
                  _tag: 'Running',
                  hash: next.hash,
                }),
              20_000,
            );
            expect(
              yield* Effect.promise(() =>
                closeOf(port, pluginPath('ping', ping.hash), key),
              ),
            ).toEqual({
              code: PLUGIN_MISMATCH,
              reason: mismatchReason(next.hash),
            });
          }),
        ),
      ),
    60_000,
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
            answer: () => ({ ping: missing }),
          });
          const { root, listening } = yield* start(host);
          yield* eventually(() =>
            expect(root().model.plugins['ping']?._tag).toBe('Crashed'),
          );
          const { port, key } = listening();
          expect(
            yield* Effect.promise(() =>
              closeOf(port, pluginPath('ping', missing.hash), key),
            ),
          ).toEqual({ code: PLUGIN_MISMATCH, reason: mismatchReason(null) });
          expect(root().model.plugins['ping']).toMatchObject({
            log: [`ping ${missing.hash} has no file; run the build`],
          });
        }),
      ),
    ));
});

describe('its Plugins', () => {
  it(
    'start from Connect Cloud’s first answer, reported while SettingUp, with no tunnel up',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host, opened, reports } = fake({
              healthy: () => true,
              neverOpens: true,
              answer: () => ({ ping }),
              every: '1 minute',
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
            expect(opened).toEqual([]);
            expect(reports).toEqual([
              { _tag: 'SettingUp', step: { _tag: 'Opening' } },
            ]);
          }),
        ),
      ),
    30_000,
  );

  it('wait for Connect Cloud: none runs until it answers', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ping = release();
          let down = true;
          const { host, reports } = fake({
            healthy: () => true,
            answer: () => (down ? null : { ping }),
          });
          const { root } = yield* start(host);
          yield* eventually(() => expect(reports.length).toBeGreaterThan(5));
          expect(root().model.wanted).toEqual({});
          down = false;
          yield* eventually(() =>
            expect(root().model.wanted).toEqual({ ping }),
          );
        }),
      ),
    ));

  it(
    'keep running while the tunnel is broken',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host, opened } = fake({
              healthy: () => false,
              answer: () => ({ ping }),
            });
            const { root, listening, pluginIds } = yield* start(host);
            yield* eventually(
              () => expect(root().model.plugins['ping']?._tag).toBe('Running'),
              20_000,
            );
            const plugins = pluginIds();
            const { port, key } = listening();
            const context = yield* Layer.build(
              client(Ping, {
                url: `ws://127.0.0.1:${port}${pluginPath('ping', ping.hash)}`,
                protocols: ['ke-connect', `key.${key}`],
              }),
            );
            const api = yield* Effect.provideContext(
              RpcClient.make(Ping),
              context,
            );
            expect(yield* api.ping()).toBe('pong');

            // Generation after generation fails its checks.
            const before = opened.length;
            yield* eventually(() =>
              expect(opened.length).toBeGreaterThan(before + 2),
            );
            expect(root().model.plugins['ping']?._tag).toBe('Running');
            expect(pluginIds()).toEqual(plugins);
            expect(yield* api.ping()).toBe('pong');
          }),
        ),
      ),
    30_000,
  );

  it(
    'run exactly what Connect Cloud names: a new Release swaps one, and one no longer named stops',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const newer = release('// newer\n');
            const pong = release('// pong\n');
            let answer: Readonly<Record<string, typeof ping>> | null = {
              ping,
              pong,
            };
            const { host } = fake({
              healthy: () => true,
              answer: () => answer,
            });
            const { root, pluginIds } = yield* start(host);
            yield* eventually(() => {
              expect(root().model.plugins['ping']?._tag).toBe('Running');
              expect(root().model.plugins['pong']?._tag).toBe('Running');
            }, 20_000);
            expect(pluginIds()).toHaveLength(2);

            answer = { ping: newer };
            yield* eventually(() =>
              expect(root().model.wanted).toEqual({ ping: newer }),
            );
            yield* eventually(() => expect(pluginIds()).toHaveLength(1));
            expect(root().model.plugins['pong']).toBeUndefined();

            // A Report that fails answers nothing, so nothing changes.
            answer = null;
            yield* Effect.sleep('100 millis');
            expect(root().model.wanted).toEqual({ ping: newer });
            expect(pluginIds()).toHaveLength(1);

            // A list with nothing on it is still the list.
            answer = {};
            yield* eventually(() => expect(root().model.wanted).toEqual({}));
            yield* eventually(() => expect(pluginIds()).toHaveLength(0));
          }),
        ),
      ),
    30_000,
  );
});
