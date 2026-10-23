import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { Action, Store } from '../index.js';
import { Store as Memory } from '../store/memory/index.js';
import {
  Pocket,
  Wallet,
  balances,
  eventually,
  makeWorld,
  messagesAt,
  read,
  run,
  start,
} from './fixtures.js';

const transfer = {
  _tag: 'Asked',
  from: 'a',
  to: 'b',
  wallet: 'w1',
  into: 'w2',
  amount: 10,
} as const;

/** A world where `a` holds w1 with 100 and `b` holds w2 with 50, both shown. */
const ready = (store = Memory.memory()) =>
  Effect.gen(function* () {
    const world = makeWorld();
    world.backend.put(Wallet, {
      id: 'w1',
      account: 'a',
      name: 'Cash',
      balance: 100,
    });
    world.backend.put(Wallet, {
      id: 'w2',
      account: 'b',
      name: 'Bank',
      balance: 50,
    });
    const app = yield* start(world, store);
    const seen = read(app);
    yield* eventually(() => {
      expect(balances(seen.mine())).toEqual({ w1: 100 });
      expect(balances(seen.theirs())).toEqual({ w2: 50 });
    });
    const entries = (account: string) =>
      world.under(
        Effect.map(Pocket.get(account), (pocket) => [
          ...pocket.entries.values(),
        ]),
      );
    return { world, app, seen, store, entries };
  });

describe('Action', () => {
  it('rolls back every Optimistic Change, across Collections and Instances, when it fails', () =>
    run(
      Effect.gen(function* () {
        const { world, app, seen, entries } = yield* ready();
        const respond = yield* world.holdAnswer();
        app.send('Root/page#1', transfer);

        yield* eventually(() => {
          expect(balances(seen.mine())).toEqual({ w1: 90 });
          expect(balances(seen.theirs())).toEqual({ w2: 60 });
        });
        expect(yield* entries('a')).toMatchObject([
          { id: 'entry-w1', amount: -10 },
        ]);
        expect(messagesAt(app, 'Root/replicas#1/pocket[a]')).toContainEqual({
          _tag: 'ActionBegan',
          action: 'Transfer',
        });

        yield* respond('refuse');
        yield* eventually(() =>
          expect(read(app).page().model.ended).toEqual(['The Backend refused']),
        );
        yield* eventually(() => {
          expect(balances(seen.mine())).toEqual({ w1: 100 });
          expect(balances(seen.theirs())).toEqual({ w2: 50 });
        });
        expect(yield* entries('a')).toEqual([]);
        expect(messagesAt(app, 'Root/replicas#1/pocket[a]')).toContainEqual({
          _tag: 'ActionEnded',
          action: 'Transfer',
        });
      }),
    ));

  it('shows what Confirm stored in place of the Optimistic Changes, with no flicker', () =>
    run(
      Effect.gen(function* () {
        const { world, app, seen, entries } = yield* ready();
        const shown: number[] = [];
        const stop = app.subscribe(() => {
          const balance = balances(seen.mine())['w1'];
          if (balance !== undefined && shown.at(-1) !== balance)
            shown.push(balance);
        });
        const respond = yield* world.holdAnswer();
        app.send('Root/page#1', transfer);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 90 }),
        );

        yield* respond('ok');
        yield* eventually(() =>
          expect(read(app).page().model.ended).toEqual([null]),
        );
        // The ending Message carries the args it was asked with.
        expect(read(app).page().model.endedFor).toEqual([transfer.wallet]);
        yield* Effect.sleep('50 millis');
        stop();

        expect(shown).toEqual([100, 90]);
        // Every change the Query was sent says 90: none puts 100 back between.
        const sent = messagesAt(app, 'Root/page#1/mine')
          .filter(({ _tag }) => _tag === 'Changed')
          .flatMap(({ updated, added }) =>
            [
              ...(updated as ReadonlyArray<{
                readonly row: { readonly balance: number };
              }>),
              ...(added as ReadonlyArray<{
                readonly row: { readonly balance: number };
              }>),
            ].map(({ row }) => row.balance),
          );
        expect(sent.length).toBeGreaterThan(0);
        expect(new Set(sent)).toEqual(new Set([90]));
        expect(seen.mine()?.rows[0]?.row).toMatchObject({
          balance: 90,
          _meta: { _e: 'Wallet' },
          $synced: true,
        });
        expect(balances(seen.theirs())).toEqual({ w2: 60 });
        expect(yield* entries('a')).toMatchObject([
          { id: 'entry-w1', _meta: { _e: 'Entry' }, $synced: true },
        ]);
      }),
    ));

  it('fails clearly on an Instance that stopped, and rolls back', () =>
    run(
      Effect.gen(function* () {
        const { world, app, seen, store } = yield* ready();
        const respond = yield* world.holdAnswer();
        app.send('Root/page#1', transfer);
        yield* eventually(() =>
          expect(balances(seen.theirs())).toEqual({ w2: 60 }),
        );

        yield* Effect.flatMap(Store, (kept) => kept.remove(Pocket, 'a')).pipe(
          Effect.provide(store),
        );
        yield* respond('ok');
        yield* eventually(() =>
          expect(read(app).page().model.ended).toEqual([
            'Instance pocket·a has stopped, so it cannot confirm what the Backend returned',
          ]),
        );
        yield* eventually(() =>
          expect(balances(seen.theirs())).toEqual({ w2: 50 }),
        );
      }),
    ));

  it('makes Optimistic Changes only inside an Action', async () => {
    const outside = await Effect.runPromise(
      Effect.flip(Action.optimistic(() => {})),
    );
    expect(outside.message).toBe(
      'Action.optimistic runs only inside an Action',
    );
  });
});
