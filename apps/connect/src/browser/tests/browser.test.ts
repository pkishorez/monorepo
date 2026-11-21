import {
  Clock,
  Context,
  Effect,
  Fiber,
  Layer,
  Option,
  Schedule,
  type Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { Accounts } from '@kestack/auth-toolkit/client';
import { fakeAccounts } from '@kestack/auth-toolkit/fake';
import { addressOf, CloudClient } from '../../cloud/client/index.js';
import {
  CodeClient,
  CodeClients,
  ConnectionAddress,
  type LinkStatus,
  pluginPath,
} from '../../connection/plugins/code/api/index.js';
import {
  fileSystem,
  HOME,
} from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { fakeGit } from '../../connection/plugins/code/engine/services/git/fake/index.js';
import { agentEdges } from './agent.js';
import {
  type Computer,
  Computers,
  ConnectCloud,
  inTab,
  type Stopped,
  tunnelClients,
  tunnelOf,
} from '../index.js';

/*
 * Connect in a tab over computers made of the File System and Git fakes,
 * sharing the fake harness, and a Harness Host, Models and Speech that
 * answer plainly: a computer that comes online is listed Ready through Connect
 * Cloud's handlers; its code Plugin answers through `tunnelClients`, as Code
 * dials it, with the Release and the Connection Key checked as its tunnel
 * checks them; and once it goes offline its socket drops, and its Last
 * Seen stays, so it is Down after three Heartbeats.
 */

const RELEASE = 'a'.repeat(64);
const ANOTHER = 'b'.repeat(64);
const WANTED = {
  code: {
    hash: RELEASE,
    url: `https://connect.fake/releases/code/${RELEASE}.mjs`,
  },
};
const EMAIL = 'ada@kestack.test';
const KEY = 'k'.repeat(32);

/** Down: no Report for three Heartbeats of 15 seconds, as Code reads a Connection. */
const DOWN_AFTER = 45_000;

const opened: Array<Runtime<typeof fileSystem.actor>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((runtime) => runtime.dispose()));
});

/** A computer online with the sample project at `~/code/shop`. */
const computer = (id: string, more: Partial<Computer> = {}): Computer => {
  const runtime = Runtime.make(fileSystem.actor);
  opened.push(runtime);
  runtime.root.send({ _tag: 'AddSampleProject', folder: '~/code/shop' });
  const files = fileSystem.serve(runtime);
  return {
    id,
    name: `${id} (main)`,
    email: EMAIL,
    version: '0.0.9',
    online: true,
    silentFor: null,
    removed: false,
    startedAt: 1,
    key: KEY,
    status: {
      _tag: 'Ready',
      url: tunnelOf(id),
      check: { _tag: 'Reachable', at: 1 },
    },
    release: null,
    edges: Layer.merge(files, fakeGit.pipe(Layer.provide(files))),
    ...more,
  };
};

/** Computers a test changes, and every stop it was told of. */
const world = Effect.gen(function* () {
  const list = yield* SubscriptionRef.make<ReadonlyArray<Computer>>([]);
  const stops: Array<readonly [string, Stopped]> = [];
  const layer = Layer.succeed(Computers, {
    changes: SubscriptionRef.changes(list),
    stopped: (id, why) => Effect.sync(() => void stops.push([id, why])),
    anotherDevice: () => Effect.void,
  });
  const set = (...computers: ReadonlyArray<Computer>) =>
    SubscriptionRef.set(list, computers);
  const change = (id: string, more: Partial<Computer>) =>
    SubscriptionRef.update(list, (all) =>
      all.map((each) => (each.id === id ? { ...each, ...more } : each)),
    );
  return { layer, set, change, stops };
});

/** Code's side: Connect Cloud's client, signed in as Ada, and each Connection's socket at the address it is listed at. */
const app = (computers: Layer.Layer<Computers>) =>
  Effect.gen(function* () {
    const accounts = fakeAccounts({ choose: Effect.succeed({ email: EMAIL }) });
    const middle = inTab({ wanted: WANTED }).pipe(
      Layer.provide(
        Layer.mergeAll(computers, ConnectCloud.deployed, agentEdges()),
      ),
      Layer.provideMerge(accounts),
    );
    const built = yield* Layer.build(middle);
    yield* Effect.flatMap(Accounts, (each) => each.signIn()).pipe(
      Effect.provideContext(built),
    );
    const cloud = Context.get(built, CloudClient);
    const address = Layer.succeed(ConnectionAddress, {
      // Until it is listed up at an address, as Code's waits.
      of: (connectionId) =>
        Effect.orDie(cloud.List({})).pipe(
          Effect.flatMap((listed) => {
            const found = listed.find(({ id }) => id === connectionId);
            const tunnel = found === undefined ? null : addressOf(found.status);
            return tunnel === null
              ? Effect.fail('not listed yet')
              : Effect.succeed({
                  url: `${tunnel}${pluginPath('code', RELEASE)}`,
                  key: found!.key,
                });
          }),
          Effect.retry(Schedule.spaced('20 millis')),
          Effect.orDie,
        ),
    });
    const clients = Context.get(
      yield* Layer.build(
        tunnelClients.pipe(
          Layer.provide(address),
          Layer.provide(Layer.succeedContext(built)),
        ),
      ),
      CodeClients,
    );
    const on = <A, E>(id: string, effect: Effect.Effect<A, E, CodeClient>) =>
      CodeClients.on(id, effect).pipe(
        Effect.provideService(CodeClients, clients),
      );
    return { cloud, clients, on, built };
  });

const eventually = (assertion: () => Promise<void> | void) =>
  Effect.promise(() =>
    vi.waitFor(assertion, { timeout: 10_000, interval: 20 }),
  );

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

/** The Session a start's stream ends with. */
const started = (
  steps: Stream.Stream<
    | { readonly _tag: 'Step' }
    | { readonly _tag: 'Started'; readonly session: { readonly id: string } },
    unknown
  >,
) =>
  Stream.runCollect(steps).pipe(
    Effect.map((all) => {
      const last = all.at(-1);
      if (last?._tag !== 'Started') throw new Error('never Started');
      return last.session;
    }),
  );

describe('Connect in a tab', () => {
  it('lists a computer that comes online Ready, and runs its code Plugin over its edges', () =>
    run(
      Effect.gen(function* () {
        const { layer, set } = yield* world;
        const { cloud, on } = yield* app(layer);
        expect(yield* cloud.List({})).toEqual([]);

        yield* set(computer('laptop'));
        yield* eventually(async () => {
          const [laptop] = await Effect.runPromise(cloud.List({}));
          expect(laptop).toMatchObject({
            id: 'laptop',
            name: 'laptop (main)',
            key: KEY,
            version: '0.0.9',
            status: {
              _tag: 'Ready',
              url: 'https://laptop.computers.fake',
              check: { _tag: 'Reachable' },
            },
            wanted: WANTED,
          });
        });

        const echo = yield* on(
          'laptop',
          Effect.gen(function* () {
            const api = yield* CodeClient;
            const listing = yield* api.listFolder({ path: '~/code' });
            expect(listing.folders.map(({ name }) => name)).toEqual(['shop']);
            const project = yield* api.addProject({
              path: `${HOME}/code/shop`,
            });
            const session = yield* started(
              api.startSession({
                id: null,
                projectId: project.id,
                account: 'claude',
                model: 'claude-test',
                settings: {},
                text: 'hello from the tab',
                attachments: [],
                branch: null,
                newWorktree: false,
              }),
            );
            return yield* api
              .messages({ sessionId: session.id, after: null })
              .pipe(
                Stream.flattenIterable,
                Stream.map(({ value }) => JSON.stringify(value)),
                Stream.filter((each) =>
                  each.includes('echo:hello from the tab'),
                ),
                Stream.runHead,
              );
          }),
        );
        expect(Option.isSome(echo)).toBe(true);
      }),
    ));

  it("closes a socket asking for a Release the computer doesn't run, or offering another key, as its tunnel does", () =>
    run(
      Effect.gen(function* () {
        const { layer, set, change } = yield* world;
        const { cloud, clients, on, built } = yield* app(layer);
        yield* set(computer('laptop', { release: ANOTHER }));
        const mismatch = yield* Effect.forkScoped(
          clients.mismatch('laptop').pipe(
            Stream.filter((each) => each !== null),
            Stream.runHead,
          ),
        );
        const harnesses = Effect.flatMap(CodeClient, (api) => api.harnesses());
        const answered = yield* Effect.forkScoped(on('laptop', harnesses));
        expect(yield* Fiber.join(mismatch)).toEqual(
          Option.some({ running: ANOTHER }),
        );

        // Once it runs the Release Connect Cloud names, the call waiting is answered.
        yield* change('laptop', { release: null });
        expect(
          (yield* Fiber.join(answered)).map(({ account }) => account),
        ).toEqual(['claude']);

        // Its key rotated: the socket open stays open, and a new one
        // offering the old key is closed KEY_EXPIRED.
        yield* change('laptop', { key: 'n'.repeat(32) });
        yield* eventually(async () => {
          const [laptop] = await Effect.runPromise(cloud.List({}));
          expect(laptop?.key).toBe('n'.repeat(32));
        });
        expect(yield* on('laptop', harnesses)).toHaveLength(1);
        const stale = Context.get(
          yield* Layer.build(
            tunnelClients.pipe(
              Layer.provide(
                Layer.succeed(ConnectionAddress, {
                  of: () =>
                    Effect.succeed({
                      url: `wss://laptop.computers.fake${pluginPath('code', RELEASE)}`,
                      key: KEY,
                    }),
                }),
              ),
              Layer.provide(Layer.succeedContext(built)),
            ),
          ),
          CodeClients,
        );
        const expired = yield* Effect.forkScoped(
          stale.expired('laptop').pipe(Stream.filter(Boolean), Stream.runHead),
        );
        yield* Effect.forkScoped(
          CodeClients.on('laptop', harnesses).pipe(
            Effect.provideService(CodeClients, stale),
          ),
        );
        expect(yield* Fiber.join(expired)).toEqual(Option.some(true));
      }),
    ));

  it('drops its socket once it goes offline, and links again once it is back', () =>
    run(
      Effect.gen(function* () {
        const { layer, set, change, stops } = yield* world;
        const { clients, on } = yield* app(layer);
        yield* set(computer('laptop'));
        const links: Array<LinkStatus> = [];
        yield* Effect.forkScoped(
          Stream.runForEach(CodeClients.link('laptop'), (now) =>
            Effect.sync(() => void links.push(now)),
          ).pipe(Effect.provideService(CodeClients, clients)),
        );
        const harnesses = Effect.flatMap(CodeClient, (api) => api.harnesses());
        yield* on('laptop', harnesses);
        yield* eventually(() => expect(links.at(-1)).toBe('linked'));

        yield* change('laptop', { online: false });
        yield* eventually(() => expect(links.at(-1)).toBe('relinking'));

        yield* change('laptop', { online: true });
        yield* eventually(() => expect(links.at(-1)).toBe('linked'));
        expect(yield* on('laptop', harnesses)).toHaveLength(1);
        expect(stops).toEqual([]);
      }),
    ));

  it('reports every 15 seconds while online; offline, its Last Seen stays, so it is Down 45 seconds on', () =>
    run(
      Effect.gen(function* () {
        const { layer, set, change } = yield* world;
        const { cloud } = yield* app(layer);
        const lastSeen = () =>
          Effect.runPromise(
            Effect.map(Effect.orDie(cloud.List({})), ([one]) => one?.lastSeen),
          );
        /** How long since its last Report, by Connect Cloud's clock. */
        const since = Effect.gen(function* () {
          const [laptop] = yield* Effect.orDie(cloud.List({}));
          return (yield* Clock.currentTimeMillis) - laptop!.lastSeen;
        });
        /** Lets the tab follow a change, in real time: the clock stands still. */
        const settle = Effect.promise(
          () => new Promise((resolve) => setTimeout(resolve, 50)),
        );

        yield* set(computer('laptop'));
        yield* eventually(async () => expect(await lastSeen()).toBe(0));
        yield* TestClock.adjust('15 seconds');
        yield* eventually(async () => expect(await lastSeen()).toBe(15_000));
        expect(yield* since).toBe(0);

        yield* change('laptop', { online: false });
        yield* settle;
        yield* TestClock.adjust('45 seconds');
        expect(yield* since).toBe(DOWN_AFTER);
        yield* TestClock.adjust('1 second');
        expect(yield* since).toBeGreaterThan(DOWN_AFTER);

        // Back online, it reports at once.
        yield* change('laptop', { online: true });
        yield* eventually(async () => expect(await lastSeen()).toBe(61_000));
      }).pipe(Effect.provide(TestClock.layer())),
    ));

  it('stops a computer Connect Cloud forgot, until it starts again, and says so', () =>
    run(
      Effect.gen(function* () {
        const { layer, set, change, stops } = yield* world;
        const { cloud } = yield* app(layer);
        yield* set(computer('laptop'));
        yield* eventually(async () => {
          expect(await Effect.runPromise(cloud.List({}))).toHaveLength(1);
        });
        yield* cloud.Forget({ id: 'laptop' });
        expect(yield* cloud.List({})).toEqual([]);
        // Its next Report is refused: it signs out and stops.
        yield* change('laptop', { key: 'n'.repeat(32) });
        yield* eventually(() =>
          expect(stops).toEqual([['laptop', { _tag: 'Forgotten' }]]),
        );
        expect(yield* cloud.List({})).toEqual([]);

        // Started again, it reports again, and is refused again: a
        // forgotten Connection stays forgotten.
        yield* change('laptop', { startedAt: 2 });
        yield* eventually(() => expect(stops).toHaveLength(2));
        expect(yield* cloud.List({})).toEqual([]);
      }),
    ));
});
