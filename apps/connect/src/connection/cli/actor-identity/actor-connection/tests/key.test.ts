import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import { KEY_EXPIRED, pluginPath } from '../../../../../contract/index.js';
import {
  closeOf,
  eventually,
  fake,
  get,
  inputOf,
  release,
  start,
  upgrade,
  withKey,
} from './fixtures/connection.js';
import { Ping } from './fixtures/ping.js';

/*
 * The Connection Key: the server mints it and keeps one, and it rotates while
 * the Connection runs, against a real server and a real Plugin.
 */

describe('the Connection Key', () => {
  it('is minted as the port opens, one for each Connection', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const one = yield* start(fake({ healthy: () => true }).host);
          const other = yield* start(fake({ healthy: () => true }).host);
          yield* eventually(() => {
            expect(one.root().state._tag).toBe('Listening');
            expect(other.root().state._tag).toBe('Listening');
          });
          expect(one.listening().key).toMatch(/^[A-Za-z0-9_-]{43}$/);
          expect(one.listening().key).not.toBe(other.listening().key);
        }),
      ),
    ));

  it('goes in every Report', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, keys } = fake({ healthy: () => true });
          const { listening } = yield* start(host);
          yield* eventually(() => expect(keys.length).toBeGreaterThan(5));
          expect(new Set(keys)).toEqual(new Set([listening().key]));
        }),
      ),
    ));

  it('closes a socket offering any other with 4401, answers plain HTTP 401, and keeps /health open', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host } = fake({ healthy: () => true });
          const { root, listening } = yield* start(host);
          yield* eventually(() => expect(root().state._tag).toBe('Listening'));
          const { port } = listening();
          const path = pluginPath('ping', 'a'.repeat(64));
          expect(
            yield* Effect.promise(() => closeOf(port, path, 'made-up')),
          ).toEqual({ code: KEY_EXPIRED, reason: 'key expired' });
          const wrong = yield* Effect.promise(() =>
            get(port, path, withKey('made-up')),
          );
          expect(wrong.status).toBe(401);
          expect(wrong.body).toContain('expired');
          // No key at all stays 401, as does a socket offering none.
          expect((yield* Effect.promise(() => get(port, path))).status).toBe(
            401,
          );
          expect(yield* Effect.promise(() => upgrade(port, path))).toBe(401);
          // A bad origin is refused before any key is read.
          expect(
            yield* Effect.promise(() =>
              upgrade(port, path, {
                ...withKey('made-up'),
                origin: 'https://evil.com',
              }),
            ),
          ).toBe(403);
          expect(
            (yield* Effect.promise(() => get(port, '/health'))).status,
          ).toBe(200);
        }),
      ),
    ));

  it(
    'rotating, is reported at once, leaves an open socket open, and closes a new socket offering the old',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host, keys, opened } = fake({
              healthy: () => true,
              answer: () => ({ ping }),
              every: '1 minute',
            });
            const { running, root, listening, tunnel, pluginIds } =
              yield* start(host);
            yield* eventually(
              () => expect(root().model.plugins['ping']?._tag).toBe('Running'),
              20_000,
            );
            const { port, key: old } = listening();
            const path = pluginPath('ping', ping.hash);

            // A raw socket, whose close would be seen, and an RPC client on another.
            let closedAt: number | null = null;
            const open = new WebSocket(`ws://127.0.0.1:${port}${path}`, [
              'ke-connect',
              `key.${old}`,
            ]);
            open.onclose = () => {
              closedAt = Date.now();
            };
            yield* Effect.promise(
              () =>
                new Promise((resolve) => {
                  open.onopen = resolve;
                }),
            );
            const context = yield* Layer.build(
              client(Ping, {
                url: `ws://127.0.0.1:${port}${path}`,
                protocols: ['ke-connect', `key.${old}`],
              }),
            );
            const api = yield* Effect.provideContext(
              RpcClient.make(Ping),
              context,
            );
            expect(yield* api.ping()).toBe('pong');
            const tunnelBefore = tunnel();
            const pluginsBefore = pluginIds();

            running.send('Connection', { _tag: 'KeyRotated', key: 'new-key' });

            // No Heartbeat is due for a minute: only the change itself says it.
            yield* eventually(() => expect(keys.at(-1)).toBe('new-key'));
            expect(listening()).toEqual({
              _tag: 'Listening',
              port,
              key: 'new-key',
            });

            // A new socket offering the old key is closed; one with the new is let in.
            expect(
              yield* Effect.promise(() => closeOf(port, path, old)),
            ).toEqual({ code: KEY_EXPIRED, reason: 'key expired' });
            expect(
              yield* Effect.promise(() =>
                upgrade(port, path, withKey('new-key')),
              ),
            ).toBe(101);

            // What was open still works, and no Child started over.
            expect(yield* api.ping()).toBe('pong');
            expect(closedAt).toBeNull();
            expect(open.readyState).toBe(WebSocket.OPEN);
            open.close();
            expect(opened).toEqual(['https://t1.example']);
            expect(tunnel()).toMatchObject({
              id: (tunnelBefore as { readonly id: string }).id,
            });
            expect(pluginIds()).toEqual(pluginsBefore);
          }),
        ),
      ),
    30_000,
  );

  it('rotates every `rotateEvery`, without starting over the Workers that report', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          // A key changes three times as often as a check is due, so a Worker
          // that started over with each would never reach one.
          const { host, keys, reports, opened } = fake({
            healthy: () => true,
            every: '150 millis',
          });
          const startedAt = Date.now();
          yield* start(host, { ...inputOf(), rotateEvery: 50 });
          yield* eventually(() =>
            expect(reports).toContainEqual({
              _tag: 'Ready',
              url: 'https://t1.example',
              check: { _tag: 'Reachable', at: expect.any(Number) },
            }),
          );
          yield* eventually(() =>
            expect(new Set(keys).size).toBeGreaterThanOrEqual(4),
          );
          expect(opened).toEqual(['https://t1.example']);
          // One Report for each key, and one for each check due, and no more.
          const due = (Date.now() - startedAt) / 150;
          expect(reports.length).toBeLessThanOrEqual(
            new Set(keys).size + Math.ceil(due) + 1,
          );
        }),
      ),
    ));
});

describe('a key rotated while SettingUp', () => {
  it('is reported at once, without starting setup over', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, keys, reports } = fake({
            healthy: () => true,
            neverOpens: true,
            every: '1 minute',
          });
          const { running, tunnel } = yield* start(host);
          yield* eventually(() => expect(keys.length).toBe(1));
          running.send('Connection', { _tag: 'KeyRotated', key: 'new-key' });
          yield* eventually(() => expect(keys).toHaveLength(2));
          expect(keys.at(-1)).toBe('new-key');
          expect(reports.every(({ _tag }) => _tag === 'SettingUp')).toBe(true);
          expect(tunnel()).toMatchObject({ model: { generation: 0 } });
        }),
      ),
    ));
});
