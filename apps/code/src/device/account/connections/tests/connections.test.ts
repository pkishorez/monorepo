import 'fake-indexeddb/auto';
import {
  Context,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import {
  CloudClient,
  type Connection as ConnectionSchema,
  PLUGIN_MISMATCH,
} from '@kestack/connect/cloud';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import {
  connection as RpcConnection,
  type SocketWatch,
} from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import {
  Cache,
  type Gone,
  SavedDrafts,
  Sync,
} from '../connection/store/index.ts';
import {
  Connections,
  ConnectionsChannel,
  type SetupParts,
} from '../connections.ts';
import { Storage } from '../../store/index.ts';
import {
  cacheMemory,
  seenMemory,
  syncMemory,
} from '../connection/store/index.ts';
import { connectionsLayer as connections } from '../connections.ts';
import {
  CHECK_FOR,
  ConnectionsLive,
  RECHECK,
  RELINK_SLOWLY,
} from '../actor.ts';
import { PLUGIN_CODE } from '../connection/link/index.ts';
import { ListShelf } from '../commands.ts';
import { Prepared } from '../connections.ts';
import { SetupShelf } from '../connection/commands.ts';

/*
 * Connections with Cloud Connect and the databases stood in for: the list
 * kept in the Account's database shows first and Cloud Connect's answer
 * replaces it and is kept; only the first answer prunes, and only the
 * Account's own Connections not on it, by database, never the Account; a
 * list that failed prunes nothing. Forget asks Cloud Connect, takes the
 * Connection out of the list, then stops its records and deletes its
 * database alone, its Saved Drafts with it; `Connections` says all of it to
 * the pages, waiting for a Connection with an address; and while a Connection's
 * link is not up Cloud Connect is asked again, every few seconds, until
 * every link is. A kept list's Last Seen is believed only once Cloud
 * Connect answers, or `CHECK_FOR` passes without.
 */

type Connection = typeof ConnectionSchema.Type;

const connection = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Connection => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status:
    url === null
      ? { _tag: 'Opening' }
      : { _tag: 'Reachable', url, at: lastSeen },
  lastSeen,
  plugins: {},
  wanted: {},
  minConnect: null,
  displayName: null,
});

/** What the root page is told by Connections preparing: nothing, here. */
const unprepared = Layer.succeed(Prepared, { ready: () => Effect.void });

const OwnerLive = Actor.define('Owner', {}).build({
  provides: () => Layer.merge(connections, unprepared),
  children: {
    connections: Actor.child(ConnectionsLive, {
      input: () => ({ accountId: 'a1' }),
      props: () => ({ email: 'me@example.com', drawn: true }),
    }),
  },
});

type Api = CodeClient['Service'];

/** A test's stand-ins, and what they were asked; every link is up unless `down` says otherwise. */
const world = (
  listed: Effect.Effect<ReadonlyArray<Connection>, Error>,
  down: SubscriptionRef.SubscriptionRef<ReadonlySet<string>> | null = null,
  /** Where Cloud Connect says this Code's Release stands, each time it is asked. */
  standing: Effect.Effect<{ readonly _tag: string }, unknown> = Effect.succeed({
    _tag: 'Latest',
  }),
) => {
  const forgotten: Array<string> = [];
  /** Each prune of the Account's Connections, by database. */
  const kept: Array<{
    accountId: string;
    connectionIds: ReadonlyArray<string>;
  }> = [];
  /** The Connections whose records were stopped and deleted. */
  const dropped: Array<string> = [];
  /** The Connections whose databases were deleted. */
  const deleted: Array<string> = [];
  /** The Gones told to the Saved Drafts. */
  const drafts: Array<string> = [];
  let lists = 0;
  /** Each ask of where this Code's Release stands. */
  const standings: Array<unknown> = [];
  /** What each Connection's sockets tell the app as they answer and close. */
  const watches = new Map<string, SocketWatch>();
  const socket = (connectionId: string) =>
    down === null
      ? Stream.concat(Stream.make('connected' as const), Stream.never)
      : SubscriptionRef.changes(down).pipe(
          Stream.map((ids) =>
            ids.has(connectionId)
              ? ('reconnecting' as const)
              : ('connected' as const),
          ),
        );
  const layer = Layer.mergeAll(
    CodeClients.make((connectionId, watch) =>
      Layer.mergeAll(
        Layer.effectDiscard(
          Effect.sync(() => void watches.set(connectionId, watch)),
        ),
        // An RPC client's procedures are generic over how they are called;
        // a stand-in answers the one way the app calls them.
        Layer.mock(CodeClient)({
          watchSpeechToText: (() =>
            Stream.make({
              _tag: 'Off' as const,
            })) as unknown as Api['watchSpeechToText'],
          harnessAccounts: (() =>
            Effect.succeed([])) as unknown as Api['harnessAccounts'],
          harnesses: (() => Effect.succeed([])) as unknown as Api['harnesses'],
        }),
        Layer.mock(RpcConnection)({
          connectionStatus: socket(connectionId),
          keepSubscribed: (subscribe) => subscribe(),
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      ),
    ),
    Layer.mock(CloudClient)({
      // A Connection forgotten is no longer listed.
      List: () =>
        Effect.andThen(
          Effect.sync(() => void lists++),
          Effect.map(listed, (each) =>
            each.filter(({ id }) => !forgotten.includes(id)),
          ),
        ),
      Forget: ({ id }: { readonly id: string }) =>
        Effect.sync(() => void forgotten.push(id)),
      Standing: (input: unknown) =>
        Effect.andThen(
          Effect.sync(() => void standings.push(input)),
          standing,
        ),
    } as never),
    // Each Connection's Store in memory; what is dropped, said.
    Layer.effect(
      Sync,
      Effect.map(Sync, (sync) => ({
        ...sync,
        drop: (gone: Gone) =>
          Effect.sync(() => {
            if (gone._tag === 'Connection') dropped.push(gone.connectionId);
          }),
      })),
    ).pipe(Layer.provide(syncMemory())),
    Layer.mock(Storage)({
      pruneConnections: (accountId, connectionIds) =>
        Effect.sync(() => void kept.push({ accountId, connectionIds })),
      dropConnection: (_, connectionId) =>
        Effect.sync(() => void deleted.push(connectionId)),
    }),
    Layer.mock(SavedDrafts)({
      drop: (gone) => Effect.sync(() => void drafts.push(gone._tag)),
    }),
    seenMemory(),
  );
  return {
    layer,
    forgotten,
    kept,
    dropped,
    deleted,
    drafts,
    watches,
    lists: () => lists,
    standings,
  };
};

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** Runs a test with what is kept in memory, `Kept` handed to its app too. */
const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Cache>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(cacheMemory()),
    ) as Effect.Effect<A>,
  );

/** Starts the app over the stand-ins and the test's `Kept`. */
const start = <A extends Parameters<typeof Runtime.start>[0]>(
  actor: A,
  layer: Layer.Layer<never, never, never> | Layer.Layer<any>,
) =>
  Effect.flatMap(Cache, (kept) =>
    Runtime.start(
      actor as never,
      Layer.merge(layer, Layer.succeed(Cache, kept)) as never,
    ),
  ) as Effect.Effect<Running<unknown>, never, Scope.Scope | Cache>;

const a1 = { accountId: 'a1', connectionId: null, projectId: null };
const setupOf = (connectionId: string) => ({
  accountId: 'a1',
  connectionId,
  projectId: null,
});
const speechOff: SetupParts = {
  accounts: null,
  speech: { _tag: 'Off' },
  harnesses: null,
  models: [],
};

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

const list = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'Connections')!;

/** Whether the list's Last Seen is believed yet. */
const checkedOf = (app: Running<unknown>) =>
  (list(app).model as { readonly checked: boolean }).checked;

const listModel = (app: Running<unknown>) => {
  const { list: held, fetchedAt } = list(app).model as {
    readonly list: { readonly value: ReadonlyArray<Connection> | null };
    readonly fetchedAt: number | null;
  };
  return { connections: held.value, fetchedAt };
};

describe('Connections', () => {
  it('shows the saved list first, then Cloud Connect’s, and keeps it', async () => {
    const answer = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Connection>>(),
    );
    const { layer, kept, drafts, deleted } = world(Deferred.await(answer));
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(ListShelf, a1, [connection('m1', 1)]);
        yield* saved.write(SetupShelf, setupOf('m1'), speechOff);
        yield* saved.write(SetupShelf, setupOf('m2'), speechOff);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(listModel(app).fetchedAt).toBeNull();
        // The saved list may be stale: nothing is deleted for it.
        expect(kept).toEqual([]);
        yield* Deferred.succeed(answer, [
          connection('m2', 2),
          connection('m3', 3),
        ]);
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual([
          'm2',
          'm3',
        ]);
        expect(yield* saved.read(ListShelf, a1)).toHaveLength(2);
        // A Connection gone from the first list goes with its database, of the
        // Account's own Connections alone, and none is told one by one.
        expect(kept).toEqual([
          { accountId: 'a1', connectionIds: ['m2', 'm3'] },
        ]);
        expect(drafts).toEqual([]);
        expect(deleted).toEqual([]);
        expect((yield* saved.read(SetupShelf, setupOf('m2')))?.speech).toEqual({
          _tag: 'Off',
        });
      }),
    );
  });

  it('deletes nothing for a later list, which another tab may have outrun', async () => {
    let listed: ReadonlyArray<Connection> = [
      connection('m1', 1),
      connection('m2', 2),
    ];
    const { layer, kept } = world(Effect.sync(() => listed));
    await run(
      Effect.gen(function* () {
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(kept).toEqual([
          { accountId: 'a1', connectionIds: ['m1', 'm2'] },
        ]);
        listed = [connection('m1', 1)];
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(kept).toHaveLength(1);
      }),
    );
  });

  it('keeps nothing less when Cloud Connect cannot be asked', async () => {
    const { layer, kept } = world(Effect.fail(new Error('offline')));
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(ListShelf, a1, [connection('m1', 1)]);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(kept).toEqual([]);
      }),
    );
  });

  it('forgets a Connection at Cloud Connect, takes it out of the list, then deletes its database here, and no other', async () => {
    const { layer, forgotten, kept, dropped, deleted, drafts } = world(
      Effect.succeed([connection('m1', 5), connection('m2', 1)]),
    );
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(SetupShelf, setupOf('m1'), speechOff);
        yield* saved.write(SetupShelf, setupOf('m2'), speechOff);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        app.send(list(app).id, { _tag: 'ForgetAsked', id: 'm1' });
        yield* wait();
        expect(forgotten).toEqual(['m1']);
        // Its own alone: another tab may list a Connection not heard of here.
        expect(dropped).toEqual(['m1']);
        expect(drafts).toEqual(['Connection']);
        expect(deleted).toEqual(['m1']);
        expect(yield* saved.read(SetupShelf, setupOf('m2'))).not.toBeNull();
        expect(kept).toHaveLength(1);
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m2']);
      }),
    );
  });

  it('takes a rename into the list at once, keeps it, and drops an answer asked before it', async () => {
    const stale = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Connection>>(),
    );
    const before = [connection('m1', 1), connection('m2', 2)];
    // The first ask, then one that answers late, then Cloud Connect renamed.
    const answers = [
      Effect.succeed(before),
      Deferred.await(stale),
      Effect.succeed([
        { ...connection('m1', 1), displayName: 'Work' },
        connection('m2', 2),
      ]),
    ];
    let asked = 0;
    const { layer } = world(
      Effect.suspend(() => answers[Math.min(asked++, answers.length - 1)]!),
    );
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        // Asked before the rename, answered after it, with the old name.
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* wait();
        app.send(list(app).id, {
          _tag: 'Renamed',
          id: 'm1',
          displayName: 'Work',
        });
        yield* wait();
        const names = (connections: ReadonlyArray<Connection> | null) =>
          connections?.map(({ id, displayName }) => [id, displayName]);
        expect(names(listModel(app).connections)).toEqual([
          ['m1', 'Work'],
          ['m2', null],
        ]);
        expect(names(yield* saved.read(ListShelf, a1))).toEqual([
          ['m1', 'Work'],
          ['m2', null],
        ]);
        yield* Deferred.succeed(stale, before);
        yield* wait();
        expect(asked).toBe(3);
        expect(names(listModel(app).connections)).toEqual([
          ['m1', 'Work'],
          ['m2', null],
        ]);
      }),
    );
  });

  it('shares what it holds as `Connections`, which waits for an address', async () => {
    const OwnerReading = Actor.define('Reader', {
      model: Schema.Struct({ reached: Schema.NullOr(Schema.String) }),
      message: Schema.TaggedUnion({ Reached: { url: Schema.String } }),
      requires: [Connections],
    }).build({
      init: () => ({ model: { reached: null } }),
      workers: {
        reach: {
          run: (self) =>
            Effect.flatMap(Connections, (connections) =>
              connections.reachable('m1'),
            ).pipe(
              Effect.flatMap(({ tunnel }) =>
                self.send({ _tag: 'Reached', url: tunnel }),
              ),
            ),
        },
      },
      on: { Reached: ({ url }) => ({ model: { reached: url } }) },
    });
    const Both = Actor.define('Both', {}).build({
      provides: () => Layer.merge(connections, unprepared),
      children: {
        connections: Actor.child(ConnectionsLive, {
          input: () => ({ accountId: 'a1' }),
          props: () => ({ email: null, drawn: true }),
        }),
        reader: Actor.child(OwnerReading),
      },
    });
    let listed: ReadonlyArray<Connection> = [connection('m1', 1, null)];
    const { layer } = world(Effect.sync(() => listed));
    await run(
      Effect.gen(function* () {
        const app = yield* start(Both, layer);
        yield* wait();
        const reader = () =>
          walk(app.snapshot()).find((each) => each.actor === 'Reader')!
            .model as { readonly reached: string | null };
        expect(reader().reached).toBeNull();
        listed = [connection('m1', 2)];
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* wait();
        expect(reader().reached).toBe('wss://m1.trycloudflare.com');
      }),
    );
  });
});

describe('Connections preparing', () => {
  /** Who `Connections` says the Connections are of, and which, as a reader hears it. */
  const Watcher = Actor.define('Watcher', {
    requires: [Connections],
    model: Schema.Struct({
      accountId: Schema.NullOr(Schema.String),
      ids: Schema.NullOr(Schema.Array(Schema.String)),
    }),
    message: Schema.TaggedUnion({
      Heard: {
        accountId: Schema.NullOr(Schema.String),
        ids: Schema.NullOr(Schema.Array(Schema.String)),
      },
    }),
  }).build({
    init: () => ({ model: { accountId: null, ids: null } }),
    workers: {
      hear: {
        run: (self) =>
          Stream.runForEach(
            Stream.unwrap(Effect.map(Connections, ({ state }) => state)),
            ({ accountId, connections }) =>
              self.send({
                _tag: 'Heard',
                accountId,
                ids: connections?.map(({ id }) => id) ?? null,
              }),
          ),
      },
    },
    on: { Heard: ({ accountId, ids }) => ({ model: { accountId, ids } }) },
  });

  /** The root page's part: `a1` drawn, `a2` preparing, until the test swaps them. */
  const Root = Actor.define('Root', {
    model: Schema.Struct({
      drawn: Schema.String,
      wanted: Schema.String,
      ready: Schema.Array(Schema.String),
    }),
    message: Schema.TaggedUnion({
      Ready: { accountId: Schema.String },
      Swapped: {},
    }),
  }).build({
    init: () => ({ model: { drawn: 'a1', wanted: 'a2', ready: [] } }),
    provides: (self) =>
      Layer.merge(
        connections,
        Layer.succeed(Prepared, {
          ready: (accountId) => self.send({ _tag: 'Ready', accountId }),
        }),
      ),
    children: {
      connections: Actor.child(ConnectionsLive, {
        each: ({ model }) => [...new Set([model.drawn, model.wanted])],
        input: (_, accountId) => ({ accountId }),
        props: ({ model }, accountId) => ({
          email: null,
          drawn: accountId === model.drawn,
        }),
      }),
      watcher: Actor.child(Watcher),
    },
    on: {
      Ready: ({ accountId }, { model }) => ({
        model: { ...model, ready: [...model.ready, accountId] },
      }),
      Swapped: (_, { model }) => ({
        model: { ...model, drawn: model.wanted },
      }),
    },
  });

  it('shares nothing until drawn, says once its kept list is read, and stays shared as the Account before goes', async () => {
    // Cloud Connect never answers: only what was kept shows.
    const { layer } = world(Effect.never);
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(ListShelf, a1, [connection('m1', 1)]);
        yield* saved.write(ListShelf, { ...a1, accountId: 'a2' }, [
          connection('m2', 1),
        ]);
        const app = yield* start(Root, layer);
        yield* wait();
        const root = () =>
          app.snapshot().model as {
            readonly drawn: string;
            readonly ready: ReadonlyArray<string>;
          };
        const heard = () =>
          walk(app.snapshot()).find((each) => each.actor === 'Watcher')!
            .model as {
            readonly accountId: string | null;
            readonly ids: ReadonlyArray<string> | null;
          };
        expect(root().ready).toEqual(['a2']);
        expect(heard()).toEqual({ accountId: 'a1', ids: ['m1'] });
        app.send(app.snapshot().id, { _tag: 'Swapped' });
        yield* wait();
        expect(heard()).toEqual({ accountId: 'a2', ids: ['m2'] });
        expect(root().ready).toEqual(['a2']);
      }),
    );
  });
});

describe('Connections rechecks', () => {
  /** Lets the app settle under the test's clock. */
  const settle = Effect.gen(function* () {
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
    yield* wait(5);
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
  });

  const timed = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Cache>) =>
    Effect.runPromise(
      Effect.scoped(effect).pipe(
        Effect.provide(cacheMemory()),
        Effect.provide(TestClock.layer()),
      ) as Effect.Effect<A>,
    );

  it('asks Cloud Connect again while a link is not up, and stops once every link is', () =>
    timed(
      Effect.gen(function* () {
        const down = yield* SubscriptionRef.make<ReadonlySet<string>>(
          new Set(['m1']),
        );
        const { layer, lists } = world(
          Effect.succeed([connection('m1', 1), connection('m2', 1)]),
          down,
        );
        yield* start(OwnerLive, layer);
        yield* settle;
        expect(lists()).toBe(1);
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(2);
        // Every link up: nothing more is asked.
        yield* SubscriptionRef.set(down, new Set());
        yield* settle;
        yield* TestClock.adjust(RECHECK.slow * 2);
        yield* settle;
        expect(lists()).toBe(2);
        // A link drops: asked again.
        yield* SubscriptionRef.set(down, new Set(['m2']));
        yield* settle;
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(3);
      }),
    ));

  it('asks less often after the first minute, and at once on Reload', () =>
    timed(
      Effect.gen(function* () {
        const down = yield* SubscriptionRef.make<ReadonlySet<string>>(
          new Set(['m1']),
        );
        const { layer, lists } = world(
          Effect.succeed([connection('m1', 1)]),
          down,
        );
        const app = yield* start(OwnerLive, layer);
        yield* settle;
        for (let at = 0; at < RECHECK.fastFor; at++) {
          yield* TestClock.adjust(RECHECK.fast);
          yield* settle;
        }
        expect(lists()).toBe(1 + RECHECK.fastFor);
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(1 + RECHECK.fastFor);
        yield* TestClock.adjust(RECHECK.slow - RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(2 + RECHECK.fastFor);
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* settle;
        expect(lists()).toBe(3 + RECHECK.fastFor);
      }),
    ));
});

describe('Connections checks', () => {
  const settle = Effect.gen(function* () {
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
    yield* wait(5);
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
  });

  it('believes the kept list’s Last Seen only once Cloud Connect answers', async () => {
    const answer = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Connection>>(),
    );
    const { layer } = world(Deferred.await(answer));
    await run(
      Effect.gen(function* () {
        yield* (yield* Cache).write(ListShelf, a1, [connection('m1', 1)]);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(checkedOf(app)).toBe(false);
        yield* Deferred.succeed(answer, [connection('m1', 2)]);
        yield* wait();
        expect(checkedOf(app)).toBe(true);
      }),
    );
  });

  it('checks the list again, asking at once, when the page comes back after a while hidden', async () => {
    const answers = await Effect.runPromise(
      Effect.all([
        Deferred.make<ReadonlyArray<Connection>>(),
        Deferred.make<ReadonlyArray<Connection>>(),
      ]),
    );
    let answer = answers[0];
    const { layer } = world(Effect.suspend(() => Deferred.await(answer)));
    await run(
      Effect.gen(function* () {
        yield* (yield* Cache).write(ListShelf, a1, [connection('m1', 1)]);
        const app = yield* start(OwnerLive, layer);
        yield* Deferred.succeed(answers[0], [connection('m1', 2)]);
        yield* wait();
        expect(checkedOf(app)).toBe(true);
        // Back: not believed again until Cloud Connect answers anew.
        answer = answers[1];
        app.send(list(app).id, { _tag: 'Back' });
        yield* wait();
        expect(checkedOf(app)).toBe(false);
        yield* Deferred.succeed(answers[1], [connection('m1', 3)]);
        yield* wait();
        expect(checkedOf(app)).toBe(true);
      }),
    );
  });

  it('believes it anyway once Cloud Connect has been waited on for long enough', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { layer } = world(Effect.fail(new Error('offline')));
          yield* (yield* Cache).write(ListShelf, a1, [connection('m1', 1)]);
          const app = yield* start(OwnerLive, layer);
          yield* settle;
          expect(checkedOf(app)).toBe(false);
          yield* TestClock.adjust(CHECK_FOR - 1);
          yield* settle;
          expect(checkedOf(app)).toBe(false);
          yield* TestClock.adjust(1);
          yield* settle;
          expect(checkedOf(app)).toBe(true);
        }),
      ).pipe(
        Effect.provide(cacheMemory()),
        Effect.provide(TestClock.layer()),
      ) as Effect.Effect<void>,
    ));
});

describe('Connections mismatched', () => {
  /** The close reason of a Connection serving `running`, as its router says it. */
  const mismatchReason = (running: string | null) =>
    JSON.stringify({ running });

  const OLDER = 'b'.repeat(64);

  /** The Connections' Links and mismatches, as it holds them. */
  const linksOf = (app: Running<unknown>) =>
    list(app).model as {
      readonly links: Readonly<Record<string, string>>;
      readonly mismatched: Readonly<
        Record<
          string,
          {
            readonly running: string | null;
            readonly standing: string | null;
            readonly held: boolean;
          }
        >
      >;
    };

  /** The app over a Cloud Connect that says `standing`, counting each move to Code's newest build. */
  const started = (
    standing: Effect.Effect<{ readonly _tag: string }, unknown>,
  ) => {
    let moves = 0;
    const { layer, watches, standings } = world(
      Effect.succeed([connection('m1', Date.now())]),
      null,
      standing,
    );
    const told = Layer.succeed(
      OnOutdated,
      Effect.sync(() => void moves++),
    );
    return {
      app: start(OwnerLive, Layer.merge(layer, told)),
      /** The Connection closes its socket, serving `running`. */
      mismatch: (running: string | null = OLDER) =>
        watches.get('m1')!.closed!({
          code: PLUGIN_MISMATCH,
          reason: mismatchReason(running),
        }),
      answered: () => watches.get('m1')!.answered!(),
      standings,
      moves: () => moves,
    };
  };

  /** Runs a test on the TestClock, real time passing for the rest. */
  const onClock = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Cache>) =>
    run(effect.pipe(Effect.provide(TestClock.layer())));

  it('asks Cloud Connect afresh at each mismatch; Latest, the Connection is Updating and relinks at once', async () => {
    const {
      app: starting,
      mismatch,
      answered,
      standings,
      moves,
    } = started(Effect.succeed({ _tag: 'Latest' }));
    await run(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'linked' });
        mismatch();
        yield* wait();
        expect(standings).toEqual([{ plugin: 'code', hash: PLUGIN_CODE }]);
        expect(linksOf(app).links).toEqual({ m1: 'relinking' });
        expect(linksOf(app).mismatched['m1']).toMatchObject({
          running: OLDER,
          standing: 'Latest',
          held: false,
        });
        // Still behind on the next socket: asked again, never from the list.
        mismatch();
        yield* wait();
        expect(standings).toHaveLength(2);
        // Updated: a socket to it is answered, and it is linked.
        answered();
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'linked' });
        expect(linksOf(app).mismatched).toEqual({});
        expect(moves()).toBe(0);
      }),
    );
  });

  it('holds the Link for good once Cloud Connect says this Code is Older, and moves to its newest build once', async () => {
    const {
      app: starting,
      mismatch,
      standings,
      moves,
    } = started(Effect.succeed({ _tag: 'Older' }));
    await onClock(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        mismatch();
        yield* wait();
        expect(linksOf(app).mismatched['m1']).toMatchObject({
          standing: 'Older',
          held: true,
        });
        expect(moves()).toBe(1);
        // Nothing changes it until a reload: no relink, no ask, no move.
        yield* TestClock.adjust(RELINK_SLOWLY * 4);
        yield* wait();
        mismatch();
        yield* wait();
        expect(linksOf(app).mismatched['m1']).toMatchObject({ held: true });
        expect(linksOf(app).links).toEqual({ m1: 'relinking' });
        expect(standings).toHaveLength(1);
        expect(moves()).toBe(1);
      }),
    );
  });

  it('relinks slowly while Cloud Connect is behind, Unknown, asking again each time', async () => {
    const {
      app: starting,
      mismatch,
      standings,
      moves,
    } = started(Effect.succeed({ _tag: 'Unknown' }));
    await onClock(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        mismatch();
        yield* wait();
        expect(linksOf(app).mismatched['m1']).toMatchObject({
          standing: 'Unknown',
          held: true,
        });
        yield* TestClock.adjust(RELINK_SLOWLY - 1);
        yield* wait();
        expect(linksOf(app).mismatched['m1']?.held).toBe(true);
        yield* TestClock.adjust(1);
        yield* wait();
        expect(linksOf(app).mismatched['m1']?.held).toBe(false);
        // Relinked, and refused again: Cloud Connect is asked again.
        mismatch();
        yield* wait();
        expect(standings).toHaveLength(2);
        expect(linksOf(app).mismatched['m1']?.held).toBe(true);
        expect(moves()).toBe(0);
      }),
    );
  });

  it('decides nothing while Cloud Connect cannot be reached, and relinks slowly', async () => {
    const {
      app: starting,
      mismatch,
      moves,
    } = started(Effect.fail(new Error('offline')));
    await onClock(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        mismatch();
        yield* wait();
        expect(linksOf(app).mismatched['m1']).toMatchObject({
          standing: null,
          held: true,
        });
        expect(linksOf(app).links).toEqual({ m1: 'relinking' });
        yield* TestClock.adjust(RELINK_SLOWLY);
        yield* wait();
        expect(linksOf(app).mismatched['m1']?.held).toBe(false);
        expect(moves()).toBe(0);
      }),
    );
  });

  it('asks nothing of a socket that closes another way', async () => {
    const { layer, watches, standings } = world(
      Effect.succeed([connection('m1', Date.now())]),
    );
    await run(
      Effect.gen(function* () {
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        watches.get('m1')!.closed!({ code: 1006, reason: '' });
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'linked' });
        expect(linksOf(app).mismatched).toEqual({});
        expect(standings).toEqual([]);
      }),
    );
  });

  it('gives no address for a held Link until it is let go', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(connections);
          const { known } = Context.get(context, ConnectionsChannel);
          const reachable = Context.get(context, Connections).reachable;
          yield* SubscriptionRef.update(known, (now) => ({
            ...now,
            connections: [connection('m1', 1)],
            held: ['m1'],
          }));
          const reached = yield* Effect.forkScoped(reachable('m1'));
          yield* wait();
          expect(reached.pollUnsafe()).toBeUndefined();
          yield* SubscriptionRef.update(known, (now) => ({
            ...now,
            held: [],
          }));
          expect((yield* Fiber.join(reached)).tunnel).toBe(
            'wss://m1.trycloudflare.com',
          );
        }),
      ),
    ));
});
