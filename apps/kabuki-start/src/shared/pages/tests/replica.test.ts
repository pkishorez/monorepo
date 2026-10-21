import { Effect, Layer, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import type { Instance, Running } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  type Account,
  Accounts,
  AccountsState,
} from '@kestack/auth-toolkit/client';
import type { Entity } from '@kestack/std-toolkit/core';
import { Store } from '@kestack/std-toolkit/replica/memory';
import { describe, expect, it, vi } from 'vitest';
import { HelloHttp } from '../../../apis/hello-http/index.ts';
import { HelloRpc } from '../../../apis/hello-rpc/index.ts';
import {
  type Entry,
  Overdraft,
  PocketRpc,
  transferEntryIds,
  type Wallet,
} from '../../../apis/pocket/index.ts';
import { Pages, router } from '../index.ts';

/*
 * The Replica page with two signed-in Accounts, over a Pocket Worker kept
 * in memory that logs every call and which Account it was for. Your Pocket
 * follows the active Account; Peek reads the other from the device without
 * fetching it; Sync shows each Instance, and one nobody reads stopping.
 */

const ada: Account = {
  id: 'ada',
  email: 'ada@x.com',
  name: 'Ada',
  image: null,
};
const bob: Account = {
  id: 'bob',
  email: 'bob@x.com',
  name: 'Bob',
  image: null,
};

/** `Accounts` with Ada active and Bob signed in; a switch lands at once. */
const fakeAccounts = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make<AccountsState>(
    AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
  );
  return Layer.succeed(
    Accounts,
    Accounts.of({
      state: SubscriptionRef.changes(ref),
      current: SubscriptionRef.get(ref),
      check: SubscriptionRef.get(ref),
      signIn: () => Effect.void,
      signOut: () => Effect.void,
      signOutAll: Effect.void,
      switchTo: (id) =>
        SubscriptionRef.set(
          ref,
          AccountsState.SignedIn({
            active: id === bob.id ? bob : ada,
            accounts: [ada, bob],
          }),
        ),
    }),
  );
});

type Stored = Entity<Wallet> | Entity<Entry>;

/** The Pocket Worker in memory: what each Account holds, and every call made. */
const fakeWorker = () => {
  let clock = 0;
  const held = new Map<string, Stored[]>();
  const calls: Array<{ readonly call: string; readonly account: string }> = [];
  const meta = (_e: string) => ({
    _e,
    _v: _e === 'Wallet' ? 'v1' : 'v2',
    _d: false,
    _u: String(++clock).padStart(8, '0'),
  });
  const of = (account: string) => held.get(account) ?? [];
  const put = (account: string, entity: Stored) => {
    held.set(account, [
      ...of(account).filter((each) => each.value.id !== entity.value.id),
      entity,
    ]);
    return entity;
  };
  const wallet = (account: string, id: string) =>
    of(account).find(
      (each): each is Entity<Wallet> =>
        each.meta._e === 'Wallet' && each.value.id === id,
    )!;
  const read =
    (call: string, _e: string) =>
    (
      account: string,
      after: { readonly meta: { readonly _u: string } } | null,
    ) =>
      Effect.sync(() => {
        calls.push({ call, account });
        return of(account)
          .filter(
            (each) =>
              each.meta._e === _e &&
              (after === null || each.meta._u > after.meta._u),
          )
          .sort((a, b) => a.meta._u.localeCompare(b.meta._u)) as never;
      });

  /** Seeds a wallet, as if made on another device. */
  const seed = (account: string, id: string, name: string, balance: number) =>
    put(account, {
      value: { id, userId: account, name, balance },
      meta: meta('Wallet'),
    });

  const service = {
    wallets: read('Wallets', 'Wallet'),
    entries: read('Entries', 'Entry'),
    createWallet: (
      account: string,
      { id, name }: { id: string; name: string },
    ) =>
      Effect.sync(() => {
        calls.push({ call: 'CreateWallet', account });
        return { wallets: [seed(account, id, name, 0)], entries: [] };
      }),
    transfer: (
      account: string,
      input: {
        id: string;
        from: string;
        to: string;
        amount: number;
        note: string;
      },
    ) =>
      Effect.gen(function* () {
        calls.push({ call: 'Transfer', account });
        const from = wallet(account, input.from);
        const to = wallet(account, input.to);
        if (from.value.balance < input.amount)
          return yield* new Overdraft({
            walletId: input.from,
            balance: from.value.balance,
            amount: -input.amount,
          });
        const ids = transferEntryIds(input.id);
        const side = (id: string, walletId: string, amount: number) =>
          put(account, {
            value: {
              id,
              userId: account,
              walletId,
              amount,
              note: input.note,
              kind: 'transfer',
              transferId: input.id,
            },
            meta: meta('Entry'),
          }) as Entity<Entry>;
        return {
          wallets: [
            seed(
              account,
              from.value.id,
              from.value.name,
              from.value.balance - input.amount,
            ),
            seed(
              account,
              to.value.id,
              to.value.name,
              to.value.balance + input.amount,
            ),
          ] as Entity<Wallet>[],
          entries: [
            side(ids.from, input.from, -input.amount),
            side(ids.to, input.to, input.amount),
          ],
        };
      }),
  };
  return {
    seed,
    calls,
    layer: Layer.succeed(PocketRpc, service as unknown as PocketRpc['Service']),
  };
};

const workers = Layer.mergeAll(
  Layer.succeed(HelloHttp, {} as HelloHttp['Service']),
  Layer.succeed(HelloRpc, {} as HelloRpc['Service']),
);

const Root = Router.app(
  router,
  View.make(Pages.AppLive, () => null),
);
const loading = Router.memory(
  router,
  router.loaders({
    Static: () => Effect.succeed({ at: 0 }),
    'Static.Dynamic': () => Effect.succeed({ at: 0 }),
    'Static.Dynamic.Client': () => Effect.succeed({ at: 0 }),
    Items: () => Effect.succeed({ items: [] }),
    'Items.Item': ({ id }) => Effect.succeed({ id, name: 'Item', at: 0 }),
  }),
);

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));
const eventually = (assertion: () => void, timeout = 3000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 10 }));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
const all = (app: Running<unknown>, actor: string) =>
  walk(app.snapshot()).filter((each) => each.actor === actor);
const find = (app: Running<unknown>, actor: string) => all(app, actor)[0];

type Rows = {
  readonly keys: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<{
    readonly row: {
      readonly id: string;
      readonly balance?: number;
      readonly name?: string;
    };
  }>;
};
/** The rows of the `Wallets` Query under `parent`. */
const walletsUnder = (app: Running<unknown>, parent: string) => {
  const query = all(app, 'Wallets').find((each) => each.id.includes(parent));
  return query?.model as Rows | undefined;
};
const names = (rows: Rows | undefined) =>
  (rows?.rows ?? []).map(({ row }) => row.name).sort();
const instances = (app: Running<unknown>) =>
  (
    find(app, 'Sync')!.model as {
      readonly instances: ReadonlyArray<{
        readonly key: string;
        readonly role: string;
        readonly gate: boolean;
        readonly holders: ReadonlyArray<string>;
        readonly lingeringUntil: number | null;
      }>;
    }
  ).instances;

const opened = (path = '/replica') =>
  Effect.gen(function* () {
    const worker = fakeWorker();
    worker.seed('ada', 'cash', 'Ada cash', 1000);
    worker.seed('ada', 'bank', 'Ada bank', 0);
    worker.seed('bob', 'jar', 'Bob jar', 500);
    const app = yield* Runtime.start(
      History.make(Root.actor, { input: Root.startAt(path) }),
      Layer.mergeAll(
        loading,
        yield* fakeAccounts,
        workers,
        worker.layer,
        Store.memory(),
      ),
    );
    return { app, worker };
  });

const switchTo = (app: Running<unknown>, id: string) =>
  app.send(find(app, 'AccountSwitcher')!.id, { _tag: 'SwitchTo', id } as never);
const pocket = (app: Running<unknown>) => find(app, 'Pocket')!;

describe('the Replica page', () => {
  it("shows the active Account's Pocket, and moves to the next Account's on a switch, old rows gone first", () =>
    run(
      Effect.gen(function* () {
        const { app, worker } = yield* opened();
        yield* eventually(() =>
          expect(names(walletsUnder(app, 'pocket'))).toEqual([
            'Ada bank',
            'Ada cash',
          ]),
        );
        expect(walletsUnder(app, 'pocket')?.keys).toEqual(['pocket·ada']);

        // Every model the Query has from the switch on: never Ada's rows with Bob's key.
        const seen: Array<Rows> = [];
        const unsubscribe = app.subscribe(() => {
          const now = walletsUnder(app, 'pocket');
          if (now) seen.push(now);
        });
        switchTo(app, 'bob');
        yield* eventually(() =>
          expect(names(walletsUnder(app, 'pocket'))).toEqual(['Bob jar']),
        );
        unsubscribe();
        const bobs = seen.filter((model) => model.keys.includes('pocket·bob'));
        expect(bobs.length).toBeGreaterThan(0);
        for (const model of bobs)
          expect(names(model).some((name) => name?.startsWith('Ada'))).toBe(
            false,
          );
        // In between, the rows were cleared, not carried over.
        expect(seen.some((model) => model.rows.length === 0)).toBe(true);
        expect(worker.calls).toContainEqual({
          call: 'Wallets',
          account: 'bob',
        });
      }),
    ));

  it('writes name the Account they are for, and an overdraft rolls back with its reason', () =>
    run(
      Effect.gen(function* () {
        const { app, worker } = yield* opened();
        yield* eventually(() =>
          expect(names(walletsUnder(app, 'pocket'))).toHaveLength(2),
        );
        app.send(pocket(app).id, {
          _tag: 'Send',
          id: 't1',
          from: 'cash',
          to: 'bank',
          amount: 400,
          note: 'save',
        } as never);
        yield* eventually(() => {
          const rows = walletsUnder(app, 'pocket')!.rows.map(({ row }) => [
            row.id,
            row.balance,
          ]);
          expect(Object.fromEntries(rows)).toEqual({ cash: 600, bank: 400 });
        });
        expect(worker.calls).toContainEqual({
          call: 'Transfer',
          account: 'ada',
        });

        app.send(pocket(app).id, {
          _tag: 'Send',
          id: 't2',
          from: 'cash',
          to: 'bank',
          amount: 5000,
          note: 'too much',
        } as never);
        yield* eventually(() =>
          expect(pocket(app).model).toMatchObject({
            refused: {
              form: 'transfer',
              account: 'ada',
              reason: 'Not enough money: 6.00 left',
            },
          }),
        );
        const rows = walletsUnder(app, 'pocket')!.rows.map(({ row }) => [
          row.id,
          row.balance,
        ]);
        expect(Object.fromEntries(rows)).toEqual({ cash: 600, bank: 400 });

        // Two writes at once: the refusal still shows beside the form it came from.
        app.send(pocket(app).id, {
          _tag: 'Send',
          id: 't3',
          from: 'cash',
          to: 'bank',
          amount: 5000,
          note: 'too much',
        } as never);
        app.send(pocket(app).id, {
          _tag: 'NewWallet',
          id: 'jar',
          name: 'Ada jar',
        } as never);
        yield* eventually(() =>
          expect(pocket(app).model).toMatchObject({
            writing: [],
            refused: { form: 'transfer', account: 'ada' },
          }),
        );
      }),
    ));

  it(
    'Peek reads another Account from the device without fetching it, and its Instance stops once Peek is left',
    () =>
      run(
        Effect.gen(function* () {
          const { app, worker } = yield* opened();
          // Bob is active once, so his Pocket is kept on this device.
          switchTo(app, 'bob');
          yield* eventually(() =>
            expect(names(walletsUnder(app, 'pocket'))).toEqual(['Bob jar']),
          );
          switchTo(app, 'ada');
          yield* eventually(() =>
            expect(names(walletsUnder(app, 'pocket'))).toEqual([
              'Ada bank',
              'Ada cash',
            ]),
          );

          app.send('Router', { _tag: 'Pushed', route: router.Replica.Peek() });
          yield* eventually(() => expect(find(app, 'Peek')).toBeDefined());
          app.send(find(app, 'Peek')!.id, {
            _tag: 'Pick',
            account: 'bob',
          } as never);
          yield* eventually(() =>
            expect(names(walletsUnder(app, 'Peek'))).toEqual(['Bob jar']),
          );
          const fetched = worker.calls.filter(
            (each) => each.account === 'bob',
          ).length;
          yield* eventually(() =>
            expect(
              instances(app).find((each) => each.key === 'bob'),
            ).toMatchObject({
              gate: false,
              lingeringUntil: null,
            }),
          );
          expect(
            instances(app).find((each) => each.key === 'ada'),
          ).toMatchObject({
            gate: true,
            role: 'leading',
          });
          yield* Effect.sleep('2500 millis');
          expect(
            worker.calls.filter((each) => each.account === 'bob'),
          ).toHaveLength(fetched);

          app.send('Router', { _tag: 'Pushed', route: router.Replica() });
          yield* eventually(() => {
            const lingering = instances(app).find((each) => each.key === 'bob');
            expect(lingering?.holders).toEqual([]);
            expect(lingering?.lingeringUntil).toBeGreaterThan(Date.now());
          });
          yield* eventually(
            () =>
              expect(instances(app).map((each) => each.key)).toEqual(['ada']),
            7000,
          );
        }),
      ),
    15_000,
  );
});
