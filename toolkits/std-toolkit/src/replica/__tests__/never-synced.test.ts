import { Actor, Runtime } from '@kestack/kabuki';
import { Effect, Exit, Schema, Scope, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { oldToNew, Query, Replica, Replicas } from '../index.js';
import { Store } from '../store/memory/index.js';
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
  stored,
  type QueryModel,
} from './fixtures.js';

describe('Never Synced', () => {
  it('names the Instance until its Strategy answers, even with nothing', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ gate: false });
        const store = Store.memory();
        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(seen.mine()).toMatchObject({
            status: 'ready',
            rows: [],
            neverSynced: ['pocket·a'],
          }),
        );

        yield* world.setGate(true);
        yield* eventually(() =>
          expect(seen.mine()).toMatchObject({
            rows: [],
            caughtUp: true,
            neverSynced: [],
          }),
        );
        // The empty answer saved a cursor: that is what is remembered.
        expect((yield* stored(store, 'pocket·a', 'wallets')).cursor).not.toBe(
          null,
        );
      }),
    ));

  it('is remembered after a restart, while nothing runs', () =>
    run(
      Effect.gen(function* () {
        const store = Store.memory();
        const first = yield* Scope.make();
        const before = yield* start(makeWorld(), store).pipe(
          Scope.provide(first),
        );
        yield* eventually(() =>
          expect(read(before).mine()).toMatchObject({
            caughtUp: true,
            neverSynced: [],
          }),
        );
        yield* Scope.close(first, Exit.void);

        // The Gate stays shut: no Strategy runs, nothing is Caught Up, yet
        // the empty list is what was last synced.
        const app = yield* start(makeWorld({ gate: false }), store);
        yield* eventually(() =>
          expect(read(app).mine()).toMatchObject({
            status: 'ready',
            rows: [],
            caughtUp: false,
            neverSynced: [],
          }),
        );
      }),
    ));

  it('counts rows put in the Store without a Strategy as Never Synced', () =>
    run(
      Effect.gen(function* () {
        const world = makeWorld({ gate: false });
        const store = Store.memory();
        const kept = world.backend.put(Wallet, {
          id: 'w1',
          account: 'a',
          name: 'w1',
          balance: 5,
        });
        yield* seed(store, 'pocket·a', 'wallets', [{ id: 'w1', entity: kept }]);
        const app = yield* start(world, store);
        const seen = read(app);
        yield* eventually(() =>
          expect(balances(seen.mine())).toEqual({ w1: 5 }),
        );
        expect(seen.mine()?.neverSynced).toEqual(['pocket·a']);
      }),
    ));
});

describe('a Query across Instances', () => {
  // `a` syncs; `b` never may, so it only ever shows what is stored of it.
  const backend = makeBackend();
  const PocketLive = Replica.build(Pocket, {
    gate: ({ key }) => Stream.succeed(key === 'a'),
    gcTime: 50,
    collections: {
      wallets: {
        strategy: oldToNew({
          fetch: backend.fetch('Wallet'),
          pollEvery: '20 millis',
        }),
      },
    },
  });
  const Both = Query.make('Both', {
    props: Schema.Struct({}),
    from: () => Effect.all({ a: Pocket.get('a'), b: Pocket.get('b') }),
    query:
      (_, { a, b }) =>
      (q) =>
        q.unionAll(
          q.from({ a: a.wallets }).select(({ a }) => ({ ...a, owner: 'a' })),
          q.from({ b: b.wallets }).select(({ b }) => ({ ...b, owner: 'b' })),
        ),
  });
  const Root = Actor.define('Root', {}).build({
    provides: () => Replicas.layer,
    children: {
      replicas: Actor.child(Replicas.actor([PocketLive])),
      both: Actor.child(Both, { props: () => ({}) }),
    },
  });

  it('says which Instance each row is from, and names the one Never Synced', () =>
    run(
      Effect.gen(function* () {
        backend.put(Wallet, { id: 'w1', account: 'a', name: 'w1', balance: 1 });
        const app = yield* Runtime.start(Root, Store.memory());
        const both = () =>
          (
            app.instance({ from: 'test' }).children.both as unknown as {
              readonly model: Omit<QueryModel, 'rows'> & {
                readonly rows: ReadonlyArray<{
                  readonly row: { readonly id: string; readonly owner: string };
                }>;
              };
            }
          ).model;
        yield* eventually(() =>
          expect(both()).toMatchObject({ neverSynced: ['pocket·b'] }),
        );
        yield* eventually(() =>
          expect(both().rows.map(({ row }) => [row.owner, row.id])).toEqual([
            ['a', 'w1'],
          ]),
        );
        expect(both().neverSynced).toEqual(['pocket·b']);
      }),
    ));
});
