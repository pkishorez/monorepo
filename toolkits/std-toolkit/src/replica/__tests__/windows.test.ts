import { Effect, Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Store as Kept } from '../index.js';
import { Store } from '../store/memory/index.js';
import {
  Entry,
  Wallet,
  eventually,
  makeBackend,
  makeWorld,
  read,
  run,
  start,
  stored,
  type Backend,
  type QueryModel,
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

const readsOf = (backend: Backend, wallet?: string) =>
  backend.reads.filter(
    (each) => each.entity === 'Entry' && each.wallet === wallet,
  );

describe('Windows', () => {
  it("opens the Window a Query's `eq` names, and runs only its Strategy", () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const app = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          Store.memory(),
        );
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.instance('a')?.role).toBe('leading'),
        );
        // No Query filters entries yet: nothing reads them.
        expect(seen.windows('a')).toEqual([]);

        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() => expect(ids(seen.entries())).toEqual(['e1']));
        expect(seen.windows('a')).toMatchObject([
          { path: 'wallet', value: 'w1', users: 1, status: 'running' },
        ]);
        expect(seen.reached('a')?.workers).toContainEqual(
          expect.objectContaining({ name: 'sync', key: 'entries/wallet="w1"' }),
        );
        expect(readsOf(backend, 'w1').length).toBeGreaterThan(0);
        expect(readsOf(backend, 'w2')).toEqual([]);
        expect(readsOf(backend)).toEqual([]);
      }),
    ));

  it('moves to another Window when the Props change', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const app = yield* start(
          makeWorld({ backend, entries: 'windows', gcTime: '1 minute' }),
          Store.memory(),
        );
        const seen = read(app);
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() => expect(ids(seen.entries())).toEqual(['e1']));

        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w2'] });
        yield* eventually(() => expect(ids(seen.entries())).toEqual(['e2']));
        const [w1, w2] = ['w1', 'w2'].map((wallet) =>
          seen.windows('a').find((each) => each.value === wallet),
        );
        // w1 runs on for its GC Time with no one using it.
        expect(w1).toMatchObject({ users: 0, here: true });
        expect(w1?.gcAt).toEqual(expect.any(Number));
        expect(w2).toMatchObject({ users: 1, gcAt: null, status: 'running' });
        expect(readsOf(backend, 'w2').length).toBeGreaterThan(0);
      }),
    ));

  it('closes a Window once its GC Time passes with nothing using it', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const app = yield* start(
          makeWorld({ backend, entries: 'windows', gcTime: 100 }),
          Store.memory(),
        );
        const seen = read(app);
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() => expect(ids(seen.entries())).toEqual(['e1']));

        app.send('Root/page#1', { _tag: 'Picked', wallets: [] });
        yield* eventually(() =>
          expect(seen.windows('a')).toMatchObject([
            { value: 'w1', users: 0, gcAt: expect.any(Number) },
          ]),
        );
        yield* eventually(() => expect(seen.windows('a')).toEqual([]));
        const reads = readsOf(backend, 'w1').length;
        yield* Effect.sleep('80 millis');
        expect(readsOf(backend, 'w1')).toHaveLength(reads);
        // The Instance itself runs on: its wallets are still read.
        expect(seen.instance('a')?.holders).not.toEqual([]);
      }),
    ));

  it('opens one Window per value of an `inArray`', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const app = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          Store.memory(),
        );
        const seen = read(app);
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1', 'w2'] });
        yield* eventually(() =>
          expect(ids(seen.entries())).toEqual(['e1', 'e2']),
        );
        expect(
          seen
            .windows('a')
            .map(({ value, users }) => ({ value, users }))
            .sort((left, right) =>
              String(left.value).localeCompare(String(right.value)),
            ),
        ).toEqual([
          { value: 'w1', users: 1 },
          { value: 'w2', users: 1 },
        ]);
        expect(readsOf(backend, 'w1').length).toBeGreaterThan(0);
        expect(readsOf(backend, 'w2').length).toBeGreaterThan(0);
      }),
    ));

  it('runs the whole Collection and its Windows side by side', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const app = yield* start(
          makeWorld({ backend, entries: 'both' }),
          Store.memory(),
        );
        const seen = read(app);
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() => expect(ids(seen.entries())).toEqual(['e1']));
        const entries = seen
          .reached('a')
          ?.model.collections.find((each) => each.collection === 'entries');
        expect(entries?.strategy).toMatchObject({ status: 'running' });
        expect(entries?.windows).toMatchObject([
          { value: 'w1', status: 'running' },
        ]);
        expect(readsOf(backend).length).toBeGreaterThan(0);
        expect(readsOf(backend, 'w1').length).toBeGreaterThan(0);
        const keys = seen
          .reached('a')
          ?.workers.filter(({ name }) => name === 'sync')
          .map(({ key }) => key);
        expect(keys).toEqual(
          expect.arrayContaining(['entries/strategy', 'entries/wallet="w1"']),
        );
      }),
    ));

  it("saves each Window's cursor apart, and resumes from it", () =>
    run(
      Effect.gen(function* () {
        const { backend, e1 } = stocked();
        const store = Store.memory();
        const first = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        first.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() =>
          expect(ids(read(first).entries())).toEqual(['e1']),
        );
        const saved = yield* stored(
          store,
          'pocket·a',
          'entries',
          'wallet="w1"',
        );
        expect(saved.cursor).toEqual({
          strategy: 'old-to-new',
          state: { cursor: e1 },
        });
        // No other scope saved one.
        expect(
          (yield* stored(store, 'pocket·a', 'entries', 'wallet="w2"')).cursor,
        ).toBeNull();
        expect((yield* stored(store, 'pocket·a', 'entries')).cursor).toBeNull();
        yield* first.stop();

        backend.reads.length = 0;
        const second = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        second.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() =>
          expect(readsOf(backend, 'w1').length).toBeGreaterThan(0),
        );
        expect(readsOf(backend, 'w1')[0]?.after).toBe(e1.meta._u);
      }),
    ));

  it('has the Leader fetch a Window another participant opened', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Store.memory();
        const leader = yield* start(
          makeWorld({ backend, entries: 'windows', gcTime: 50 }),
          store,
        );
        yield* eventually(() =>
          expect(read(leader).instance('a')?.role).toBe('leading'),
        );
        const follower = yield* start(
          makeWorld({ backend, entries: 'windows', gcTime: 50 }),
          store,
        );
        const one = read(leader);
        const two = read(follower);
        yield* eventually(() =>
          expect(two.instance('a')?.role).toBe('following'),
        );

        follower.send('Root/page#1', { _tag: 'Picked', wallets: ['w2'] });
        yield* eventually(() => expect(ids(two.entries())).toEqual(['e2']));
        yield* eventually(() =>
          expect(one.windows('a')).toMatchObject([
            { value: 'w2', here: false, elsewhere: true, status: 'running' },
          ]),
        );
        expect(two.windows('a')).toMatchObject([
          { value: 'w2', here: true, status: 'idle' },
        ]);
        // What the Leader reads for it reaches the follower through the Store.
        backend.put(Entry, entry('e3', 'w2', 3));
        yield* eventually(() =>
          expect(ids(two.entries())).toEqual(['e2', 'e3']),
        );

        // Closed in the follower, it closes in the Leader too.
        follower.send('Root/page#1', { _tag: 'Picked', wallets: [] });
        yield* eventually(() => expect(one.windows('a')).toEqual([]));
      }),
    ));

  it('clears the record of a participant that crashed once it leads', () =>
    run(
      Effect.gen(function* () {
        const { backend } = stocked();
        const store = Store.memory();
        // A participant records w2 open, then is gone without closing.
        const crashed = yield* Scope.make();
        yield* Effect.flatMap(Kept, (kept) => kept.open('pocket·a')).pipe(
          Effect.flatMap((space) =>
            space.announce([
              { collection: 'entries', path: 'wallet', value: 'w2' },
            ]),
          ),
          Scope.provide(crashed),
          Effect.provide(store),
        );

        const app = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.instance('a')?.role).toBe('leading'),
        );
        yield* Effect.sleep('80 millis');
        expect(seen.windows('a')).toEqual([]);
        expect(readsOf(backend, 'w2')).toEqual([]);
      }),
    ));
});
