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
  it('lets an Instance linger once no one holds it, then stops it', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ linger: 100 });
        const app = yield* start(world, Store.memory());
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.instance('a')?.role).toBe('leading'),
        );

        app.send('Root/page#1', { _tag: 'Shown', shown: false });
        yield* eventually(() =>
          expect(seen.instance('a')).toMatchObject({
            holders: [],
            lingeringUntil: expect.any(Number),
          }),
        );
        // Held again while it lingers, it carries on.
        app.send('Root/page#1', { _tag: 'Shown', shown: true });
        yield* eventually(() =>
          expect(seen.instance('a')).toMatchObject({ lingeringUntil: null }),
        );
        app.send('Root/page#1', { _tag: 'Shown', shown: false });
        yield* eventually(() => expect(seen.instances()).toEqual([]));
      }),
    ));

  it('keeps the Instances of a kept Replica running with no one holding them', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ linger: 20, keep: true });
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
        expect(seen.instance('a')).toMatchObject({
          holders: [],
          lingeringUntil: null,
        });
      }),
    ));
});
