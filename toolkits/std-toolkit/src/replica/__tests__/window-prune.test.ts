import 'fake-indexeddb/auto';
import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { IDB } from '../../db/idb/index.js';
import { StdTable } from '../../db/index.js';
import { ESchema, EntityESchema } from '../../eschema/index.js';
import { Store } from '../index.js';
import { Store as Idb } from '../store/idb/index.js';
import { Store as Memory } from '../store/memory/index.js';
import { UNNAMED } from '../store/contract/index.js';
import {
  Entry,
  Pocket,
  Wallet,
  eventually,
  makeBackend,
  makeWorld,
  read,
  run,
  seed,
  start,
  stored,
  type Backend,
  type QueryModel,
  type World,
} from './fixtures.js';

const entry = (id: string, wallet: string, amount: number) => ({
  id,
  account: 'a',
  wallet,
  amount,
});

/** A Backend where account `a` has wallets w1 and w2, with one entry each. */
const stocked = () => {
  const backend = makeBackend();
  backend.put(Wallet, { id: 'w1', account: 'a', name: 'Cash', balance: 10 });
  backend.put(Wallet, { id: 'w2', account: 'a', name: 'Bank', balance: 20 });
  const e1 = backend.put(Entry, entry('e1', 'w1', 1));
  const e2 = backend.put(Entry, entry('e2', 'w2', 2));
  return { backend, e1, e2 };
};

const ids = (model: QueryModel | undefined) =>
  (model?.rows ?? []).map(({ row }) => row.id).sort();

const readsOf = (backend: Backend, wallet: string) =>
  backend.reads.filter(
    (each) => each.entity === 'Entry' && each.wallet === wallet,
  );

/** Keeps only these wallets' Windows of account `a`'s entries. */
const pruneKeeping = (
  store: Layer.Layer<Store>,
  wallets: ReadonlyArray<string>,
) =>
  Effect.flatMap(Store, (kept) =>
    kept.pruneWindows(Pocket, 'a', { entries: { wallet: wallets } }),
  ).pipe(Effect.provide(store));

/** The entries account `a`'s running Instance shows, whatever any Query reads. */
const shownEntries = (world: World) =>
  world.under(
    Effect.map(Pocket.get('a'), (pocket) => [...pocket.entries.keys()].sort()),
  );

/** Opens each wallet's Window in turn, then closes them all, once each has synced. */
const syncThenClose = (
  app: Effect.Success<ReturnType<typeof start>>,
  wallets: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const seen = read(app);
    for (const wallet of wallets) {
      app.send('Root/page#1', { _tag: 'Picked', wallets: [wallet] });
      yield* eventually(() =>
        expect(ids(seen.entries())).toEqual([`e${wallet.slice(1)}`]),
      );
    }
    app.send('Root/page#1', { _tag: 'Picked', wallets: [] });
    yield* eventually(() => expect(seen.windows('a')).toEqual([]));
  });

/** A space as it was laid out before records named their Window. */
const before = (() => {
  const table = StdTable.make('replica')
    .primary('pk', 'sk')
    .lsi('LSI1', 'LSI1SK')
    .build();
  const records = table
    .entity(
      EntityESchema.make('ReplicaRecord', 'id', {
        collection: Schema.String,
        seq: Schema.String,
        entity: ESchema.fromType<{} | null>(),
      }).build(),
    )
    .primary({ pk: ['collection'] })
    .index('LSI1', 'bySequence', { sk: ['seq'] })
    .build();
  const collections = table
    .entity(
      EntityESchema.make('ReplicaCollection', 'key', {
        collection: Schema.String,
        position: Schema.String,
      }).build(),
    )
    .primary({ pk: ['collection'] })
    .build();
  return { table, records, collections };
})();

describe('Window Prune', () => {
  it('deletes the cursor and records of every Window not kept', () =>
    run(
      Effect.gen(function* () {
        const { backend, e2 } = stocked();
        const store = Memory.memory();
        const world = makeWorld({ backend, entries: 'windows' });
        const app = yield* start(world, store);
        yield* syncThenClose(app, ['w1', 'w2']);

        expect(yield* pruneKeeping(store, ['w2'])).toEqual([
          'entries/wallet="w1"',
        ]);
        const w1 = yield* stored(store, 'pocket·a', 'entries', 'wallet="w1"');
        expect(w1.cursor).toBeNull();
        expect(w1.records).toEqual([e2]);
        expect(w1.windows).toEqual({ e2: 'wallet="w2"' });
        expect(
          (yield* stored(store, 'pocket·a', 'entries', 'wallet="w2"')).cursor,
        ).not.toBeNull();
        // Its own Collection lets go of what went.
        yield* until(shownEntries(world), ['e2']);
        // Asked again, there is nothing more to prune.
        expect(yield* pruneKeeping(store, ['w2'])).toEqual([]);
      }),
    ));

  it('passes over a Window open here, and one open in another participant, until each closes', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Memory.memory();
        const first = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        const second = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        first.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        second.send('Root/page#1', { _tag: 'Picked', wallets: ['w2'] });
        yield* eventually(() =>
          expect(ids(read(first).entries())).toEqual(['e1']),
        );
        yield* eventually(() =>
          expect(ids(read(second).entries())).toEqual(['e2']),
        );

        expect(yield* pruneKeeping(store, [])).toEqual([]);

        first.send('Root/page#1', { _tag: 'Picked', wallets: [] });
        // Its Leader may still sync w2 for the other: only w1 closes here.
        yield* eventually(() =>
          expect(
            read(first)
              .windows('a')
              .filter(({ here }) => here),
          ).toEqual([]),
        );
        // Closed here, w1 may still be synced by the Leader a moment, until
        // it hears: it goes once no one holds it, and w2 never.
        yield* until(pruneKeeping(store, []), ['entries/wallet="w1"']);
        expect(ids(read(second).entries())).toEqual(['e2']);
      }),
    ));

  it('passes over a Window open here while its Gate is closed and nothing syncs it', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Memory.memory();
        const world = makeWorld({ backend, entries: 'windows' });
        const app = yield* start(world, store);
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() =>
          expect(ids(read(app).entries())).toEqual(['e1']),
        );
        yield* world.setGate(false);
        yield* eventually(() =>
          expect(read(app).windows('a')).toMatchObject([{ status: 'gated' }]),
        );

        expect(yield* pruneKeeping(store, [])).toEqual([]);
        expect(ids(read(app).entries())).toEqual(['e1']);
      }),
    ));

  it("takes what was pruned out of another participant's Collection", () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Memory.memory();
        const world = makeWorld({ backend, entries: 'windows' });
        const other = makeWorld({ backend, entries: 'windows' });
        const app = yield* start(world, store);
        yield* start(other, store);
        yield* syncThenClose(app, ['w1']);
        yield* until(shownEntries(other), ['e1']);

        expect(yield* pruneKeeping(store, [])).toEqual(['entries/wallet="w1"']);
        yield* until(shownEntries(other), []);
        yield* until(shownEntries(world), []);
      }),
    ));

  it('syncs a pruned Window whole when it opens again', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Memory.memory();
        const app = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        yield* syncThenClose(app, ['w1']);
        expect(yield* pruneKeeping(store, [])).toEqual(['entries/wallet="w1"']);

        backend.reads.length = 0;
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() =>
          expect(ids(read(app).entries())).toEqual(['e1']),
        );
        expect(readsOf(backend, 'w1')[0]).toMatchObject({ after: null });
        expect(read(app).entries()?.neverSynced).toEqual([]);
      }),
    ));

  it('ends a prune stopped part way: records left with no cursor go next time', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        const store = Memory.memory();
        const records = Array.from({ length: 620 }, (_, index) => {
          const id = `e${index}`;
          return {
            id,
            entity: backend.put(Entry, entry(id, 'w1', index)),
            window: 'wallet="w1"',
          };
        });
        yield* seed(store, 'pocket·a', 'entries', records);

        expect(yield* pruneKeeping(store, [])).toEqual(['entries/wallet="w1"']);
        expect((yield* stored(store, 'pocket·a', 'entries')).records).toEqual(
          [],
        );
      }),
    ));

  it('never prunes a record of a Collection that also syncs whole', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Memory.memory();
        const app = yield* start(
          makeWorld({ backend, entries: 'both' }),
          store,
        );
        yield* syncThenClose(app, ['w1']);

        // Its cursor goes, so it syncs whole when it opens again; its
        // records are the whole Collection's.
        yield* pruneKeeping(store, []);
        const kept = yield* stored(store, 'pocket·a', 'entries');
        expect(Object.keys(kept.windows).sort()).toEqual(['e1', 'e2']);
        expect(Object.values(kept.windows)).toEqual(['', '']);
      }),
    ));

  it('names the Window of a record kept before records named theirs, so it can be pruned', () =>
    run(
      Effect.gen(function* () {
        const { backend, e1 } = stocked();
        const store = Memory.memory();
        yield* seed(store, 'pocket·a', 'entries', [
          { id: 'e1', entity: e1, window: UNNAMED },
        ]);
        const app = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        yield* eventually(() =>
          expect(read(app).instance('a')?.role).toBe('leading'),
        );
        yield* until(
          Effect.map(
            stored(store, 'pocket·a', 'entries'),
            ({ windows }) => windows,
          ),
          { e1: 'wallet="w1"' },
        );

        expect(yield* pruneKeeping(store, [])).toEqual(['entries/wallet="w1"']);
        expect((yield* stored(store, 'pocket·a', 'entries')).records).toEqual(
          [],
        );
      }),
    ));

  it('names the Window of a record IndexedDB kept under the old layout, keeping it', () =>
    run(
      Effect.gen(function* () {
        const { backend, e1 } = stocked();
        const prefix = `upgrade-${crypto.randomUUID()}:`;
        const seq = '1'.padStart(16, '0');
        yield* Effect.all([
          before.records.insert({
            collection: 'entries',
            id: 'e1',
            seq,
            entity: e1,
          }),
          before.collections.insert({
            collection: 'entries',
            key: 'collection',
            position: seq,
          }),
        ]).pipe(
          Effect.provide(
            IDB.make(before.table, {
              database: IDB.database({ databaseName: `${prefix}pocket·a` }),
              mode: 'disposable',
            }).layer,
          ),
        );
        const store = Idb.idb({ prefix });
        const app = yield* start(
          makeWorld({ backend, entries: 'windows', gate: false }),
          store,
        );
        yield* eventually(() =>
          expect(read(app).instance('a')?.role).toBe('leading'),
        );
        yield* until(
          Effect.map(
            stored(store, 'pocket·a', 'entries'),
            ({ windows }) => windows,
          ),
          { e1: 'wallet="w1"' },
        );
        expect((yield* stored(store, 'pocket·a', 'entries')).records).toEqual([
          e1,
        ]);
        expect(yield* pruneKeeping(store, [])).toEqual(['entries/wallet="w1"']);
      }),
    ));

  it('prunes an Instance never kept here by making nothing', () =>
    run(
      Effect.gen(function* () {
        const store = Memory.memory();
        expect(yield* pruneKeeping(store, [])).toEqual([]);
        const names = yield* Effect.flatMap(Store, (kept) => kept.list).pipe(
          Effect.provide(store),
        );
        expect(names).toEqual([]);
      }),
    ));

  it('prunes in IndexedDB, holding each Window by a Web Lock', () =>
    run(
      Effect.gen(function* () {
        const { backend, e2 } = stocked();
        const store = Idb.idb({ prefix: `prune-${crypto.randomUUID()}:` });
        const app = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        yield* syncThenClose(app, ['w1', 'w2']);
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w2'] });
        yield* eventually(() =>
          expect(ids(read(app).entries())).toEqual(['e2']),
        );

        // w2 is open: kept or not, it stays.
        expect(yield* pruneKeeping(store, [])).toEqual(['entries/wallet="w1"']);
        expect((yield* stored(store, 'pocket·a', 'entries')).records).toEqual([
          e2,
        ]);
      }),
    ));
});

/** Runs `effect` again until it gives `expected`, for two seconds at most. */
const until = <A, E>(effect: Effect.Effect<A, E>, expected: A) =>
  Effect.gen(function* () {
    const deadline = Date.now() + 2000;
    let last = yield* effect;
    while (
      JSON.stringify(last) !== JSON.stringify(expected) &&
      Date.now() < deadline
    ) {
      yield* Effect.sleep('5 millis');
      last = yield* effect;
    }
    expect(last).toEqual(expected);
  });
