import 'fake-indexeddb/auto';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { ReplicaError, Store } from '../index.js';
import { Store as Idb } from '../store/idb/index.js';
import { Store as Memory } from '../store/memory/index.js';
import {
  Pocket,
  Wallet,
  balances,
  eventually,
  makeBackend,
  makeWorld,
  read,
  run,
  seed,
  start,
} from './fixtures.js';

const list = (store: Layer.Layer<Store>) =>
  Effect.flatMap(Store, (kept) => kept.list).pipe(Effect.provide(store));

describe('Store', () => {
  it('fails a Query when its Instance cannot read the Store', () =>
    run(
      Effect.gen(function* () {
        const store = Layer.effect(
          Store,
          Effect.map(Store, (kept) => ({
            ...kept,
            open: (name: string) =>
              Effect.map(kept.open(name), (space) => ({
                ...space,
                read: () =>
                  Effect.fail(
                    new ReplicaError({ message: 'Cannot read this Store' }),
                  ),
              })),
          })),
        ).pipe(Layer.provide(Memory.memory()));
        const app = yield* start(makeWorld(), store);
        yield* eventually(() =>
          expect(read(app).mine()).toMatchObject({
            status: 'failed',
            problem: 'Cannot read this Store',
            rows: [],
          }),
        );
      }),
    ));

  it.each(['memory', 'idb'])(
    'hears a write between its first read and opening its Collections (%s)',
    (adapter) =>
      run(
        Effect.gen(function* () {
          const world = makeWorld({ gate: false });
          const entity = world.backend.put(Wallet, {
            id: 'w1',
            account: 'a',
            name: 'Cash',
            balance: 100,
          });
          let wrote = false;
          const store = Layer.effect(
            Store,
            Effect.map(Store, (kept) => ({
              ...kept,
              open: (name: string) =>
                Effect.map(kept.open(name), (space) => ({
                  ...space,
                  read: (collection: string, after: string | null) =>
                    Effect.gen(function* () {
                      const snapshot = yield* space.read(collection, after);
                      if (
                        name === 'pocket·a' &&
                        collection === 'wallets' &&
                        !wrote
                      ) {
                        wrote = true;
                        yield* space.write([
                          { collection, records: [{ id: 'w1', entity }] },
                        ]);
                      }
                      return snapshot;
                    }),
                })),
            })),
          ).pipe(
            Layer.provide(adapter === 'memory' ? Memory.memory() : Idb.idb()),
          );
          const app = yield* start(world, store);
          yield* eventually(() =>
            expect(balances(read(app).mine())).toEqual({ w1: 100 }),
          );
        }),
      ),
  );

  it('keeps a full chunk of records and their cursor in one write', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        const records = Array.from({ length: 99 }, (_, index) => {
          const id = `w${index}`;
          const entity = backend.put(Wallet, {
            id,
            account: 'a',
            name: id,
            balance: index,
          });
          return { id, entity };
        });
        const space = yield* Effect.flatMap(Store, (kept) =>
          kept.open('pocket·a'),
        );
        yield* space.write([
          {
            collection: 'wallets',
            records,
            cursor: {
              scope: 'strategy',
              strategy: 'old-to-new',
              state: { cursor: records.at(-1)!.entity },
            },
          },
        ]);
        const read = yield* space.read('wallets', null);
        expect(read.records).toHaveLength(99);
        expect(yield* space.cursor('wallets', 'strategy')).toMatchObject({
          strategy: 'old-to-new',
        });
      }).pipe(Effect.scoped, Effect.provide(Memory.memory())),
    ));

  it('stops an Instance it removes before deleting it', () =>
    run(
      Effect.gen(function* () {
        const store = Memory.memory();
        const world = makeWorld();
        world.backend.put(Wallet, {
          id: 'w1',
          account: 'a',
          name: 'Cash',
          balance: 100,
        });
        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100 }),
        );
        expect(yield* list(store)).toContainEqual({
          replica: 'pocket',
          key: 'a',
        });

        yield* Effect.flatMap(Store, (kept) => kept.remove(Pocket, 'a')).pipe(
          Effect.provide(store),
        );
        expect(seen.instance('a')).toBeUndefined();
        expect(yield* list(store)).not.toContainEqual({
          replica: 'pocket',
          key: 'a',
        });
        yield* eventually(() =>
          expect(seen.mine()).toMatchObject({
            status: 'failed',
            problem: 'Instance pocket·a stopped',
          }),
        );
      }),
    ));

  it('prunes every Instance it is not told to keep', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        const entity = backend.put(Wallet, {
          id: 'w1',
          account: 'x',
          name: 'Old',
          balance: 1,
        });
        const store = Idb.idb({ prefix: 'replica:prune:' });
        for (const name of ['ledger·x', 'pocket·x', 'pocket·y'])
          yield* seed(store, name, 'wallets', [{ id: 'w1', entity }]);

        const pruned = yield* Effect.flatMap(Store, (kept) =>
          kept.prune([[Pocket, ['x']]]),
        ).pipe(Effect.provide(store));

        expect([...pruned].sort()).toEqual(['ledger·x', 'pocket·y']);
        expect(yield* list(store)).toEqual([{ replica: 'pocket', key: 'x' }]);
      }),
    ));

  it('stops an Instance it prunes before deleting it', () =>
    run(
      Effect.gen(function* () {
        const store = Memory.memory();
        const world = makeWorld();
        world.backend.put(Wallet, {
          id: 'w1',
          account: 'a',
          name: 'Cash',
          balance: 100,
        });
        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100 }),
        );

        const pruned = yield* Effect.flatMap(Store, (kept) =>
          kept.prune([[Pocket, ['b']]]),
        ).pipe(Effect.provide(store));
        expect(pruned).toEqual(['pocket·a']);
        expect(seen.instance('a')).toBeUndefined();
        yield* eventually(() =>
          expect(seen.mine()).toMatchObject({
            status: 'failed',
            problem: 'Instance pocket·a stopped',
          }),
        );
      }),
    ));

  it('keeps each prefix to itself', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        const entity = backend.put(Wallet, {
          id: 'w1',
          account: 'x',
          name: 'Cash',
          balance: 1,
        });
        const one = Idb.idb({ prefix: 'replica:one:' });
        const two = Idb.idb({ prefix: 'replica:two:' });
        yield* seed(one, 'pocket·x', 'wallets', [{ id: 'w1', entity }]);
        yield* seed(two, 'pocket·y', 'wallets', [{ id: 'w1', entity }]);

        yield* Effect.flatMap(Store, (kept) => kept.prune([])).pipe(
          Effect.provide(one),
        );

        expect(yield* list(one)).toEqual([]);
        expect(yield* list(two)).toEqual([{ replica: 'pocket', key: 'y' }]);
      }),
    ));

  it('keeps Instances in IndexedDB', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld();
        world.backend.put(Wallet, {
          id: 'w1',
          account: 'idb',
          name: 'Cash',
          balance: 7,
        });
        const app = yield* start(world, Idb.idb());
        app.send('Root/page#1', { _tag: 'Switched', mine: 'idb' });
        yield* eventually(() =>
          expect(balances(read(app).mine())).toEqual({ w1: 7 }),
        );
      }),
    ));
});
