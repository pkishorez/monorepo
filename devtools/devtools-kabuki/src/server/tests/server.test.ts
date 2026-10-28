import { createServer, request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Effect, Exit, Fiber, Layer, Option, Scope, Stream } from 'effect';
import { HttpRouter } from 'effect/http';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { describe, expect, it } from 'vitest';
import { connect } from '../../session/index.ts';
import { started } from '../../session/tests/app.ts';
import { dialSession, dialSessions, kabukiRoutes } from '../index.ts';
import type { KabukiSessionsClient } from '../index.ts';

/*
 * The DevTools side end to end: a real app dials a server built from the
 * Kabuki routes, and DevTools' own clients read it through them.
 */

const OWN = 'http://127.0.0.1:14400';

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });

/** A DevTools Server with only the Kabuki routes on `port`, until the Scope closes. */
const devtools = (port: number) =>
  Layer.build(
    HttpRouter.serve(kabukiRoutes({ origins: [OWN] }), {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provide(
        // As the DevTools Server: a Kabuki Session's socket never drains.
        NodeHttpServer.layer(createServer, {
          host: '127.0.0.1',
          port,
          disablePreemptiveShutdown: true,
        }),
      ),
    ),
  );

/** A plain GET, answered with its status and body. */
const get = (port: number, path: string, headers: Record<string, string>) =>
  Effect.promise(
    () =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const sent = request(
          { host: '127.0.0.1', port, path, headers },
          (response) => {
            let body = '';
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () =>
              resolve({ status: response.statusCode ?? 0, body }),
            );
          },
        );
        sent.on('error', reject);
        sent.end();
      }),
  );

const namesOnceThere = (sessions: KabukiSessionsClient, count: number) =>
  sessions.watch().pipe(
    Stream.map((list) => list.map((one) => one.name)),
    Stream.filter((names) => names.length === count),
    Stream.runHead,
    Effect.map(Option.getOrUndefined),
  );

describe('the Kabuki routes', () => {
  it(
    'keep each app that dials under a name of its own, and forward its Api',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          yield* devtools(port);
          const url = `http://127.0.0.1:${port}`;
          const sessions = yield* dialSessions(url);
          expect(yield* sessions.list()).toEqual([]);

          const diary = yield* started;
          diary.write('first', 5);
          const stop = connect(diary.runtime, {
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
          });
          yield* Effect.addFinalizer(() => Effect.sync(stop));
          yield* namesOnceThere(sessions, 1);

          const other = yield* started;
          const stopOther = connect(other.runtime, {
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
          });
          yield* Effect.addFinalizer(() => Effect.sync(stopOther));
          expect(yield* namesOnceThere(sessions, 2)).toEqual([
            'diary',
            'diary-2',
          ]);
          const [first] = yield* sessions.list();
          expect(first).toMatchObject({ app: 'Diary', origin: null });

          const client = yield* dialSession(url, 'diary');
          const history = yield* client.history({});
          expect(history.entries.map((entry) => entry.tag)).toEqual(['Wrote']);
          expect(
            (yield* client.snapshot({ path: 'model.notes.0.text' })).value,
          ).toBe('first');
          const changes = yield* client.changes({
            step: history.entries[0]!.id,
          });
          expect(changes.changes.map((change) => change.instance)).toContain(
            'Diary',
          );
          const path = yield* Effect.flip(
            client.snapshot({ path: 'model.nope' }),
          );
          expect(path).toMatchObject({ _tag: 'PathNotFound' });
          expect(yield* client.info()).toMatchObject({ name: 'diary' });
          const now = yield* client.watch().pipe(Stream.runHead);
          expect(Option.getOrUndefined(now)).toMatchObject({ running: true });

          stopOther();
          expect(yield* namesOnceThere(sessions, 1)).toEqual(['diary']);
        }),
      ),
    20_000,
  );

  it(
    'going down, leave the list as it was: its watchers never see the Kabuki Sessions leave one by one',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const server = yield* Scope.make();
          yield* devtools(port).pipe(Scope.provide(server));
          const url = `http://127.0.0.1:${port}`;
          // Watched first: its socket is older than the apps'.
          const sessions = yield* dialSessions(url);
          for (const name of ['diary', 'shop', 'notes']) {
            const app = yield* started;
            const stop = connect(app.runtime, {
              url: `ws://127.0.0.1:${port}`,
              name,
            });
            yield* Effect.addFinalizer(() => Effect.sync(stop));
          }
          yield* namesOnceThere(sessions, 3);
          const seen: Array<number> = [];
          const watching = yield* sessions.watch().pipe(
            Stream.runForEach((list) =>
              Effect.sync(() => seen.push(list.length)),
            ),
            Effect.ignore,
            Effect.forkChild,
          );
          yield* Effect.sleep('50 millis');
          yield* Scope.close(server, Exit.void);
          yield* Fiber.await(watching);
          expect(seen.length).toBeGreaterThan(0);
          expect(seen.filter((count) => count !== 3)).toEqual([]);
        }),
      ),
    20_000,
  );

  it('answer no other origin but DevTools’ own, and say which names are live', () =>
    run(
      Effect.gen(function* () {
        const port = yield* Effect.promise(freePort);
        yield* devtools(port);
        const foreign = { origin: 'http://evil.test' };
        expect((yield* get(port, '/kabuki/sessions', foreign)).status).toBe(
          403,
        );
        expect(
          (yield* get(port, '/kabuki/session/diary', foreign)).status,
        ).toBe(403);

        const missing = yield* get(port, '/kabuki/session/diary', {
          origin: OWN,
        });
        expect(missing.status).toBe(404);
        expect(JSON.parse(missing.body)).toEqual({
          _tag: 'KabukiSessionNotFound',
          name: 'diary',
          available: [],
        });
        expect((yield* get(port, '/kabuki/connect', foreign)).status).toBe(426);
      }),
    ));
});
