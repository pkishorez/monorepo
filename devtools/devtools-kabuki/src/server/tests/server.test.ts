import { createServer, request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import {
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { McpProtocol, McpServer } from 'effect/ai';
import { HttpRouter } from 'effect/http';
import { NodeHttpServer } from '@effect/platform-node';
import { Fake, FakeWorld } from '@kestack/kabuki/fake';
import { describe, expect, it } from 'vitest';
import { connect } from '../../app.tsx';
import {
  KabukiSession,
  dialSessions,
  kabukiRoutes,
  remote,
} from '../../devtools.ts';
import type { FakeNow, KabukiSessionsClient, Told } from '../../devtools.ts';
import { started } from '../../services/kabuki-session/tests/diary.ts';

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

const devtools = (port: number) =>
  Layer.build(
    HttpRouter.serve(
      kabukiRoutes({ origins: [OWN] }).pipe(
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

const firstWhere = <A, E>(
  stream: Stream.Stream<A, E>,
  test: (a: A) => boolean,
) =>
  stream.pipe(
    Stream.filter(test),
    Stream.runHead,
    Effect.map(Option.getOrThrow<A>),
  );

class Lights extends Context.Service<
  Lights,
  { readonly on: Effect.Effect<boolean> }
>()('Test/service/Lights') {}

const Lit = Schema.Struct({ on: Schema.Boolean });

const lights = Fake.make({
  name: 'lights',
  state: Lit,
  initial: { on: false },
  controls: {
    Switched: Fake.control(
      Lit,
      Schema.Struct({ on: Schema.Boolean }),
      ({ on }, state) => SubscriptionRef.set(state, { on }),
    ),
  },
  layer: (state) =>
    Layer.succeed(Lights)({
      on: Effect.map(SubscriptionRef.get(state), ({ on }) => on),
    }),
});

describe('the full path: an app connected through a DevTools Server, called through remote', () => {
  it(
    'answers the nine calls of a live Kabuki Session by its name, Sends and runs controls',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          yield* devtools(port);
          const origin = `http://127.0.0.1:${port}`;
          const sessions = yield* dialSessions(origin);
          expect(yield* sessions.list()).toEqual([]);

          const world = FakeWorld.make([lights]);
          const services = yield* Layer.build(world.layer);
          const diary = yield* started;
          diary.write('first', 5);
          const stop = connect({
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
            environment: 'kishores-mbp',
            world,
          })(diary.app);
          yield* Effect.addFinalizer(() => Effect.sync(stop));
          yield* namesOnceThere(sessions, 1);
          expect((yield* sessions.list())[0]).toMatchObject({
            name: 'diary',
            app: 'Diary',
            environment: 'kishores-mbp',
            origin: null,
          });

          const session = Context.get(
            yield* Layer.build(remote(origin, 'diary')),
            KabukiSession,
          );
          const diaryNow = yield* session.look({ address: 'Diary' });
          expect(diaryNow.takes.map(({ tag }) => tag)).toEqual(['Wrote']);

          const now = yield* firstWhere(session.history({}), () => true);
          expect(now.entries.map(({ tag }) => tag)).toEqual(['Wrote']);

          expect(
            yield* session.send({
              to: 'Diary',
              message: {
                _tag: 'Wrote',
                note: { at: new Date(9).toISOString(), text: 'second' },
              },
            }),
          ).toBe('handled');
          const after = yield* firstWhere(
            session.history({}),
            (told: Told) => told.entries.length === 2,
          );
          expect(after.entries[1]!.from).toEqual({
            kind: 'outside',
            name: 'devtools',
          });
          const stepped = yield* session.step({});
          expect(stepped.message).toMatchObject({
            tag: 'Wrote',
            message: { note: { text: 'second' } },
          });
          const look = yield* session.look({ address: 'Diary' });
          expect(look.model).toEqual({
            notes: [
              { at: new Date(5).toISOString(), text: 'first' },
              { at: new Date(9).toISOString(), text: 'second' },
            ],
          });

          const refused = yield* Effect.flip(
            session.send({ to: 'Diary', message: { _tag: 'Nope' } }),
          );
          expect(refused).toMatchObject({
            _tag: 'MessageRefused',
            tag: 'Nope',
          });
          const lost = yield* Effect.flip(session.step({ at: 999 }));
          expect(lost).toMatchObject({ _tag: 'StepNotFound', step: 999 });

          yield* session.preview({ at: 'start' });
          expect(diary.app.seeking).toMatchObject({ entry: null });
          const previewing = yield* Effect.flip(
            session.send({ to: 'Diary', message: { _tag: 'Wrote' } }),
          );
          expect(previewing).toMatchObject({
            _tag: 'Previewing',
            step: 'start',
          });
          yield* session.preview({ at: null });
          yield* session.fork({ from: after.entries[0]!.id });
          expect(diary.app.history.head).toBe(after.entries[0]!.id);

          expect(
            yield* session.control({
              fake: 'lights',
              control: 'Switched',
              payload: { on: true },
            }),
          ).toBe('done');
          expect(yield* Context.get(services, Lights).on).toBe(true);
          const fakes = yield* firstWhere(
            session.world(),
            (list: ReadonlyArray<FakeNow>) => list.length > 0,
          );
          expect(fakes[0]).toMatchObject({
            name: 'lights',
            value: { on: true },
          });
          const control = yield* Effect.flip(
            session.control({ fake: 'lights', control: 'Broke', payload: {} }),
          );
          expect(control).toMatchObject({
            _tag: 'ControlRefused',
            reason: 'lights has no control Broke',
          });
          const plan = yield* session.blueprint();
          expect(plan).toMatchObject({ path: 'Diary', actor: 'Diary' });
          expect(plan.children.map(({ plan }) => plan.path)).toEqual([
            'Diary/counter',
          ]);
        }),
      ),
    20_000,
  );

  it(
    'names each app that dials uniquely, and forgets one once its socket closes',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          yield* devtools(port);
          const sessions = yield* dialSessions(`http://127.0.0.1:${port}`);
          const one = yield* started;
          const stopOne = connect({
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
          })(one.app);
          yield* Effect.addFinalizer(() => Effect.sync(stopOne));
          yield* namesOnceThere(sessions, 1);
          const two = yield* started;
          const stopTwo = connect({
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
          })(two.app);
          expect(yield* namesOnceThere(sessions, 2)).toEqual([
            'diary',
            'diary-2',
          ]);
          stopTwo();
          expect(yield* namesOnceThere(sessions, 1)).toEqual(['diary']);
        }),
      ),
    20_000,
  );

  it(
    'going down, leaves the list as it was: its watchers never see the Kabuki Sessions leave one by one',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const server = yield* Scope.make();
          yield* devtools(port).pipe(Scope.provide(server));
          const sessions = yield* dialSessions(`http://127.0.0.1:${port}`);
          for (const name of ['diary', 'shop', 'notes']) {
            const { app } = yield* started;
            const stop = connect({ url: `ws://127.0.0.1:${port}`, name })(app);
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

  it('answers no other origin but DevTools’ own, and says which names are live', () =>
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
