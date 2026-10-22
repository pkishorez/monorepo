import { Effect, Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Store as Kept } from '../index.js';
import { Store } from '../store/memory/index.js';
import {
  Entry,
  Wallet,
  balances,
  eventually,
  makeBackend,
  makeWorld,
  messagesAt,
  read,
  run,
  seed,
  start,
  type Backend,
} from './fixtures.js';

const wallet = (id: string, account: string, balance: number) => ({
  id,
  account,
  name: id,
  balance,
});

const entry = (id: string, wallet: string) => ({
  id,
  account: 'a',
  wallet,
  amount: 1,
});

describe('Caught Up', () => {
  it('shows stored rows at once, and is Caught Up only once its Strategy answered', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ gate: false });
        const store = Store.memory();
        const kept = world.backend.put(Wallet, wallet('w1', 'a', 100));
        yield* seed(store, 'pocket·a', 'wallets', [{ id: 'w1', entity: kept }]);

        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 100 }),
        );
        // The Gate is closed: no Strategy runs, so nothing has answered.
        yield* Effect.sleep('60 millis');
        expect(seen.mine()).toMatchObject({ status: 'ready', caughtUp: false });
        expect(seen.reached('a')?.model.caughtUp).toEqual([]);

        yield* world.setGate(true);
        yield* eventually(() => expect(seen.mine()?.caughtUp).toBe(true));
        expect(seen.reached('a')?.model.caughtUp).toEqual(
          expect.arrayContaining(['wallets/strategy', 'entries/strategy']),
        );
      }),
    ));

  it('is Caught Up on an answer that held nothing, so an empty list can be believed', () =>
    run(
      Effect.gen(function* () {
        const app = yield* start(makeWorld(), Store.memory());
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.mine()).toMatchObject({ rows: [], caughtUp: true }),
        );
        expect(messagesAt(app, 'Root/replicas#1/pocket[a]')).toContainEqual({
          _tag: 'Answered',
          collection: 'wallets',
          window: null,
        });
      }),
    ));

  it('stops being Caught Up when its Strategy stops, and is again once it answers anew', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld();
        const app = yield* start(world, Store.memory());
        const seen = read(app);
        yield* eventually(() => expect(seen.mine()?.caughtUp).toBe(true));

        yield* world.setGate(false);
        yield* eventually(() => expect(seen.mine()?.caughtUp).toBe(false));
        expect(seen.reached('a')?.model.caughtUp).toEqual([]);

        yield* world.setGate(true);
        yield* eventually(() => expect(seen.mine()?.caughtUp).toBe(true));
      }),
    ));

  it('waits on the Windows a Query opens, each on its own', () =>
    run(
      Effect.gen(function* () {
        const stocked = makeBackend();
        stocked.put(Entry, entry('e1', 'w1'));
        // The Backend takes its time to answer for w2.
        const backend: Backend = {
          ...stocked,
          fetch: (entity, wallet) =>
            wallet === 'w2'
              ? (input) =>
                  Effect.delay(stocked.fetch(entity, wallet)(input), 150)
              : stocked.fetch(entity, wallet),
        };
        const app = yield* start(
          makeWorld({ backend, entries: 'windows', gcTime: '1 minute' }),
          Store.memory(),
        );
        const seen = read(app);
        // Wallets reads no Window: its whole Strategy is all it waits on.
        yield* eventually(() => expect(seen.mine()?.caughtUp).toBe(true));

        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1'] });
        yield* eventually(() =>
          expect(seen.entries()).toMatchObject({ caughtUp: true }),
        );
        expect(seen.entries()?.rows.map(({ id }) => id)).toEqual(['e1']);

        // w1's row shows at once, but w2's Window has not answered yet.
        app.send('Root/page#1', { _tag: 'Picked', wallets: ['w1', 'w2'] });
        yield* eventually(() =>
          expect(
            messagesAt(app, 'Root/page#1/entries').filter(
              ({ _tag }) => _tag === 'Loaded',
            ),
          ).toHaveLength(2),
        );
        expect(seen.entries()).toMatchObject({
          status: 'ready',
          caughtUp: false,
        });
        expect(seen.entries()?.rows.map(({ id }) => id)).toEqual(['e1']);
        yield* eventually(() =>
          expect(seen.entries()).toMatchObject({ caughtUp: true }),
        );
        expect(seen.reached('a')?.model.caughtUp).toEqual(
          expect.arrayContaining([
            'entries/wallet="w1"',
            'entries/wallet="w2"',
          ]),
        );
      }),
    ));

  it('is told by the Leader in a follower, once what it read shows there', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        backend.put(Entry, entry('e2', 'w2'));
        const store = Store.memory();
        const leader = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        yield* eventually(() =>
          expect(read(leader).instance('a')?.role).toBe('leading'),
        );
        const follower = yield* start(
          makeWorld({ backend, entries: 'windows' }),
          store,
        );
        const two = read(follower);
        yield* eventually(() =>
          expect(two.instance('a')?.role).toBe('following'),
        );
        // It asked as it opened: the Leader's answer makes Wallets Caught Up.
        yield* eventually(() => expect(two.mine()?.caughtUp).toBe(true));

        follower.send('Root/page#1', { _tag: 'Picked', wallets: ['w2'] });
        yield* eventually(() =>
          expect(two.entries()).toMatchObject({ caughtUp: true }),
        );
        expect(two.entries()?.rows.map(({ id }) => id)).toEqual(['e2']);
      }),
    ));

  it('never believes what a Leader that crashed told', () =>
    run(
      Effect.gen(function* () {
        const store = Store.memory();
        // A Leader told wallets were Caught Up, then was gone without a word.
        const crashed = yield* Scope.make();
        yield* Effect.flatMap(Kept, (kept) => kept.open('pocket·a')).pipe(
          Effect.flatMap((space) => space.tell(['wallets/strategy'])),
          Scope.provide(crashed),
          Effect.provide(store),
        );

        const app = yield* start(makeWorld({ gate: false }), store);
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.instance('a')?.role).toBe('leading'),
        );
        yield* Effect.sleep('60 millis');
        expect(seen.mine()).toMatchObject({ status: 'ready', caughtUp: false });
        expect(seen.reached('a')?.model.caughtUp).toEqual([]);
      }),
    ));
});
