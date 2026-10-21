import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { Store } from '../store/memory/index.js';
import {
  Wallet,
  balances,
  eventually,
  makeWorld,
  messagesAt,
  read,
  run,
  seed,
  start,
  stored,
  type QueryModel,
} from './fixtures.js';

const wallet = (id: string, account: string, balance: number) => ({
  id,
  account,
  name: id,
  balance,
});

describe('Gate', () => {
  it('keeps a closed Instance readable and fetches nothing until it opens', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ gate: false });
        const store = Store.memory();
        const kept = world.backend.put(Wallet, wallet('w1', 'a', 100));
        yield* seed(store, 'pocket·a', 'wallets', [{ id: 'w1', entity: kept }]);
        world.backend.put(Wallet, wallet('w2', 'a', 5));

        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100 }),
        );
        yield* Effect.sleep('80 millis');
        expect(world.backend.reads).toEqual([]);
        expect(seen.instance('a')).toMatchObject({
          role: 'leading',
          gate: false,
        });

        yield* world.setGate(true);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100, w2: 5 }),
        );
        expect(world.backend.reads.length).toBeGreaterThan(0);
        expect(messagesAt(app, 'Root/replicas#1/pocket[a]')).toContainEqual({
          _tag: 'Gated',
          open: true,
        });
      }),
    ));
});

describe('Query', () => {
  it('clears the old rows before the new ones show when its Props pick another Instance', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld();
        world.backend.put(Wallet, wallet('w1', 'a', 100));
        world.backend.put(Wallet, wallet('w3', 'c', 30));
        const app = yield* start(world, Store.memory());
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100 }),
        );

        const shown: Array<QueryModel | undefined> = [];
        const stop = app.subscribe(() => shown.push(seen.mine()));
        app.send('Root/page#1', { _tag: 'Switched', mine: 'c' });
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w3: 30 }),
        );
        stop();

        const accounts = shown.map((model) =>
          [...new Set(model?.rows.map(({ row }) => row.account))].join(),
        );
        expect(accounts).not.toContain('a,c');
        const cleared = accounts.indexOf('');
        expect(cleared).toBeGreaterThan(-1);
        expect(accounts.slice(cleared).every((each) => each !== 'a')).toBe(
          true,
        );
        expect(seen.mine()?.keys).toEqual(['pocket·c']);

        // Each Instance keeps its Key: `a` lingers, `c` is another Instance.
        expect(seen.instance('a')).toMatchObject({ holders: [] });
        expect(seen.instance('a')?.lingeringUntil).toEqual(expect.any(Number));
        expect(seen.instance('c')?.holders).toEqual(['Root/page#1/mine#1']);
      }),
    ));

  it('sends each change as only the rows it added, updated and removed', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld();
        world.backend.put(Wallet, wallet('w1', 'a', 100));
        world.backend.put(Wallet, wallet('w2', 'a', 50));
        const app = yield* start(world, Store.memory());
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100, w2: 50 }),
        );

        world.backend.put(Wallet, wallet('w2', 'a', 70));
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100, w2: 70 }),
        );
        const changes = messagesAt(app, 'Root/page#1/mine').filter(
          ({ _tag }) => _tag === 'Changed',
        );
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({
          added: [],
          removed: [],
          updated: [{ id: 'w2', row: { balance: 70 } }],
        });
      }),
    ));
});

describe('Entities', () => {
  it('ignores an Entity newer than the app knows, advancing neither data nor cursor', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld();
        const store = Store.memory();
        const first = world.backend.put(Wallet, wallet('w1', 'a', 100));
        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100 }),
        );

        world.backend.put(Wallet, wallet('w2', 'a', 1), { version: 'v9' });
        yield* eventually(() =>
          expect(messagesAt(app, 'Root/replicas#1/pocket[a]')).toContainEqual({
            _tag: 'Outdated',
            collection: 'wallets',
          }),
        );
        // It stops reading that Collection until a reload.
        const reads = world.backend.reads.filter(
          (each) => each.entity === 'Wallet' && each.key === 'a',
        ).length;
        yield* Effect.sleep('80 millis');
        expect(
          world.backend.reads.filter(
            (each) => each.entity === 'Wallet' && each.key === 'a',
          ),
        ).toHaveLength(reads);
        expect(balances(seen.mine())).toEqual({ w1: 100 });

        const { records, cursor } = yield* stored(store, 'pocket·a', 'wallets');
        expect(records).toEqual([first]);
        expect(cursor).toEqual({
          strategy: 'old-to-new',
          state: { cursor: first },
        });
      }),
    ));

  it('keeps a tombstone in the Store and takes its row away', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld();
        const store = Store.memory();
        world.backend.put(Wallet, wallet('w1', 'a', 100));
        world.backend.put(Wallet, wallet('w2', 'a', 50));
        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100, w2: 50 }),
        );

        const tombstone = world.backend.put(Wallet, wallet('w1', 'a', 100), {
          deleted: true,
        });
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w2: 50 }),
        );
        const { records } = yield* stored(store, 'pocket·a', 'wallets');
        expect(records).toContainEqual(tombstone);
      }),
    ));
});
