import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { Store } from '../store/memory/index.js';
import {
  Wallet,
  balances,
  eventually,
  makeBackend,
  makeWorld,
  read,
  run,
  start,
} from './fixtures.js';

describe('two participants', () => {
  it('lets one lead while the other follows through the Store, and takes over when it stops', () =>
    run(
      Effect.gen(function* () {
        const backend = makeBackend();
        const store = Store.memory();
        backend.put(Wallet, {
          id: 'w1',
          account: 'a',
          name: 'Cash',
          balance: 100,
        });
        const first = yield* start(makeWorld({ backend }), store);
        const second = yield* start(makeWorld({ backend }), store);
        const one = read(first);
        const two = read(second);

        yield* eventually(() => {
          expect(balances(one.mine())).toEqual({ w1: 100 });
          expect(balances(two.mine())).toEqual({ w1: 100 });
        });
        expect(one.instance('a')?.role).toBe('leading');
        expect(two.instance('a')?.role).toBe('following');

        // The follower reads what the Leader stores.
        backend.put(Wallet, {
          id: 'w1',
          account: 'a',
          name: 'Cash',
          balance: 80,
        });
        yield* eventually(() =>
          expect(balances(two.mine())).toEqual({ w1: 80 }),
        );

        yield* first.stop();
        yield* eventually(() =>
          expect(two.instance('a')?.role).toBe('leading'),
        );
        backend.put(Wallet, {
          id: 'w1',
          account: 'a',
          name: 'Cash',
          balance: 60,
        });
        yield* eventually(() =>
          expect(balances(two.mine())).toEqual({ w1: 60 }),
        );
      }),
    ));
});

describe('Replicas', () => {
  it('runs an Instance on for its GC Time once no one holds it, then stops it', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ gcTime: 100 });
        const app = yield* start(world, Store.memory());
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.instance('a')?.role).toBe('leading'),
        );

        app.send('Root/page#1', { _tag: 'Shown', shown: false });
        yield* eventually(() =>
          expect(seen.instance('a')).toMatchObject({
            holders: [],
            gcAt: expect.any(Number),
          }),
        );
        // Held again before its GC Time runs out, it carries on.
        app.send('Root/page#1', { _tag: 'Shown', shown: true });
        yield* eventually(() =>
          expect(seen.instance('a')).toMatchObject({ gcAt: null }),
        );
        app.send('Root/page#1', { _tag: 'Shown', shown: false });
        yield* eventually(() => expect(seen.instances()).toEqual([]));
      }),
    ));

  it('keeps an Instance running with no one holding it when its GC Time is Infinity', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ gcTime: Infinity });
        const app = yield* start(world, Store.memory());
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.instance('a')?.role).toBe('leading'),
        );

        app.send('Root/page#1', { _tag: 'Shown', shown: false });
        yield* eventually(() =>
          expect(seen.instance('a')?.holders).toEqual([]),
        );
        yield* Effect.sleep('80 millis');
        expect(seen.instance('a')).toMatchObject({ holders: [], gcAt: null });
      }),
    ));
});
