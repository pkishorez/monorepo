import 'fake-indexeddb/auto';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { Store } from '../index.js';
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

  it('deletes the Instances of retired Replicas as it starts', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        const entity = backend.put(Wallet, {
          id: 'w1',
          account: 'x',
          name: 'Old',
          balance: 1,
        });
        const first = Idb.idb();
        yield* seed(first, 'ledger·x', 'wallets', [{ id: 'w1', entity }]);
        yield* seed(first, 'pocket·x', 'wallets', [{ id: 'w1', entity }]);
        expect(yield* list(first)).toEqual(
          expect.arrayContaining([
            { replica: 'ledger', key: 'x' },
            { replica: 'pocket', key: 'x' },
          ]),
        );

        const next = Idb.idb({ retired: ['ledger'] });
        const kept = yield* list(next);
        expect(kept).toContainEqual({ replica: 'pocket', key: 'x' });
        expect(kept).not.toContainEqual({ replica: 'ledger', key: 'x' });
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
