import { Deferred, Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, Headers } from 'effect/http';
import { RpcMiddleware } from 'effect/rpc';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { testAuth } from '@kestack/auth-toolkit/server/rpc';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeD1SQLite } from '@kestack/std-toolkit/db/sqlite/d1';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { PocketRpc, PocketRpcs, transferEntryIds } from './index.ts';
import { pocketTable, wallets } from './storage/index.ts';
import { serve } from './worker.server.ts';

/*
 * The Pocket Worker on a D1 database in Miniflare, called through the
 * browser's `PocketRpc`, with `testAuth` saying whose cookie each request
 * carries. Each test signs in Users of its own, so they share one database.
 */

const SITE = 'https://start.test';

let miniflare: Miniflare;
let binding: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("pocket") } }',
    compatibilityDate: '2026-07-30',
    d1Databases: ['DB'],
  });
  binding = (await miniflare.getD1Database('DB')) as unknown as D1Database;
  await Effect.runPromise(
    SQLite.setup(pocketTable, {
      database: makeD1SQLite({ database: binding }),
    }),
  );
}, 30_000);

afterAll(() => miniflare?.dispose());

let users = 0;
/** A User signed in with the cookie, new to this database. */
const signIn = (name: string) => {
  const id = `${name}-${++users}`;
  return {
    id,
    principal: {
      kind: 'session',
      user: { id, name, email: `${id}@demo.test` },
      session: { id: `s-${id}` },
    } as unknown as Principal,
  };
};

/** The Auth Guard of every Pocket call, as the contract attaches it. */
const [guard] = PocketRpcs.requests.get('Wallets')!.middlewares;

/**
 * What auth-toolkit's `browser` Layer does to a guarded call: it signs it
 * as the Account active at the moment, overwriting the call's `expect-user`.
 */
const signedAsActive = (active: string) =>
  RpcMiddleware.layerClient(guard as never, ({ request, next }) =>
    next({
      ...request,
      headers: Headers.set(request.headers, 'expect-user', active),
    }),
  ) as Layer.Layer<never>;

/**
 * Runs `program` in a browser whose cookie is `cookie`'s (nobody for null),
 * with `active` as its Active Account.
 */
const browse = <A, E>(
  cookie: { readonly principal: Principal } | null,
  program: (pocket: PocketRpc['Service']) => Effect.Effect<A, E>,
  active?: string,
) => {
  const answer = serve(testAuth(cookie?.principal ?? null), SITE, binding);
  const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    answer(new Request(input, init));
  const signing = active === undefined ? Layer.empty : signedAsActive(active);
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* program(yield* PocketRpc);
    }).pipe(
      Effect.provide(PocketRpc.layer.pipe(Layer.provide(signing))),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetch as typeof globalThis.fetch,
      ),
    ),
  );
};

/** Each User's own view: the client calls as them, with their cookie. */
const as = <A, E>(
  user: { readonly id: string; readonly principal: Principal },
  program: (
    pocket: PocketRpc['Service'],
    account: string,
  ) => Effect.Effect<A, E>,
) => browse(user, (pocket) => program(pocket, user.id), user.id);

const balances = (user: ReturnType<typeof signIn>) =>
  as(user, (pocket, account) =>
    Effect.map(pocket.wallets(account, null), (wallets) =>
      Object.fromEntries(wallets.map(({ value }) => [value.id, value.balance])),
    ),
  );

describe('the Pocket Worker', () => {
  it("reads only the caller's records, whatever the cursor names", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (pocket, account) =>
      pocket.createWallet(account, { id: 'w1', name: 'Cash' }),
    );
    const [adas] = await as(ada, (pocket, account) =>
      pocket.wallets(account, null),
    );
    expect(adas?.value).toEqual({
      id: 'w1',
      userId: ada.id,
      name: 'Cash',
      balance: 0,
    });
    expect(
      await as(bob, (pocket, account) => pocket.wallets(account, null)),
    ).toEqual([]);
    // A cursor naming Ada positions Bob's read in Bob's records alone.
    const cursor = { ...adas!, meta: { ...adas!.meta, _u: '' } };
    expect(
      await as(bob, (pocket, account) => pocket.wallets(account, cursor)),
    ).toEqual([]);
  });

  it('pages after the last record seen, in the order they changed, deletions included', async () => {
    const ada = signIn('ada');
    const all = await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        yield* pocket.createWallet(account, { id: 'w', name: 'Cash' });
        for (const id of ['e1', 'e2', 'e3'])
          yield* pocket.post(account, {
            id,
            walletId: 'w',
            amount: 100,
            note: id,
          });
        yield* pocket.deleteEntry(account, { id: 'e1' });
        return yield* pocket.entries(account, null);
      }),
    );
    expect(all.map(({ value, meta }) => [value.id, meta._d])).toEqual([
      ['e2', false],
      ['e3', false],
      ['e1', true],
    ]);
    const after = await as(ada, (pocket, account) =>
      pocket.entries(account, all[0]!),
    );
    expect(after.map(({ value }) => value.id)).toEqual(['e3', 'e1']);
    expect(
      await as(ada, (pocket, account) => pocket.entries(account, all[2]!)),
    ).toEqual([]);
  });

  it('answers a page at most, and the next page after it', async () => {
    const ada = signIn('ada');
    const pages = await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        for (let i = 0; i < 101; i++)
          yield* pocket.createWallet(account, { id: `w${i}`, name: `${i}` });
        const first = yield* pocket.wallets(account, null);
        const second = yield* pocket.wallets(account, first.at(-1)!);
        return [first.length, second.map(({ value }) => value.id)];
      }),
    );
    expect(pages).toEqual([100, ['w100']]);
  }, 30_000);

  it('moves balances with posts, transfers and deletions, and answers what changed', async () => {
    const ada = signIn('ada');
    const transferred = await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        yield* pocket.createWallet(account, { id: 'cash', name: 'Cash' });
        yield* pocket.createWallet(account, { id: 'bank', name: 'Bank' });
        const posted = yield* pocket.post(account, {
          id: 'pay',
          walletId: 'cash',
          amount: 1000,
          note: 'pay',
        });
        expect(posted.entries[0]?.value.kind).toBe('deposit');
        expect(posted.wallets[0]?.value.balance).toBe(1000);
        const spent = yield* pocket.post(account, {
          id: 'lunch',
          walletId: 'cash',
          amount: -250,
          note: 'lunch',
        });
        expect(spent.entries[0]?.value.kind).toBe('withdrawal');
        return yield* pocket.transfer(account, {
          id: 't1',
          from: 'cash',
          to: 'bank',
          amount: 500,
          note: 'save',
        });
      }),
    );
    expect(
      transferred.entries.map(({ value }) => [
        value.id,
        value.amount,
        value.kind,
      ]),
    ).toEqual([
      ['t1.from', -500, 'transfer'],
      ['t1.to', 500, 'transfer'],
    ]);
    expect(
      Object.fromEntries(
        transferred.wallets.map(({ value }) => [value.id, value.balance]),
      ),
    ).toEqual({ cash: 250, bank: 500 });

    // Deleting one side of the transfer deletes both, and puts the money back.
    const deleted = await as(ada, (pocket, account) =>
      pocket.deleteEntry(account, { id: transferEntryIds('t1').to }),
    );
    expect(
      deleted.entries.map(({ value, meta }) => [value.id, meta._d]),
    ).toEqual([
      ['t1.from', true],
      ['t1.to', true],
    ]);
    expect(await balances(ada)).toEqual({ cash: 750, bank: 0 });

    await as(ada, (pocket, account) =>
      pocket.deleteEntry(account, { id: 'lunch' }),
    );
    expect(await balances(ada)).toEqual({ cash: 1000, bank: 0 });
  });

  it('does a retried write once', async () => {
    const ada = signIn('ada');
    await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        yield* pocket.createWallet(account, { id: 'w', name: 'Cash' });
        const post = { id: 'p', walletId: 'w', amount: 300, note: '' };
        yield* pocket.post(account, post);
        const again = yield* pocket.post(account, post);
        expect(again.wallets[0]?.value.balance).toBe(300);
        const move = { id: 't', from: 'w', to: 'w2', amount: 100, note: '' };
        yield* pocket.createWallet(account, { id: 'w2', name: 'Bank' });
        yield* pocket.transfer(account, move);
        yield* pocket.transfer(account, move);
      }),
    );
    expect(await balances(ada)).toEqual({ w: 200, w2: 100 });
  });

  it('returns the existing wallet when two creates race on its id', async () => {
    const ada = signIn('create-race');
    const insert = wallets.insert;
    const both = Deferred.makeUnsafe<void>();
    let calls = 0;
    const spy = vi.spyOn(wallets, 'insert').mockImplementation((value) =>
      Effect.gen(function* () {
        if (++calls === 2) yield* Deferred.succeed(both, undefined);
        yield* Deferred.await(both);
        return yield* insert(value);
      }),
    );
    try {
      const created = await as(ada, (pocket, account) =>
        Effect.all(
          [
            pocket.createWallet(account, { id: 'w', name: 'Cash' }),
            pocket.createWallet(account, { id: 'w', name: 'Cash' }),
          ],
          { concurrency: 'unbounded' },
        ),
      );
      expect(created.map(({ wallets }) => wallets[0]?.value)).toEqual([
        { id: 'w', userId: ada.id, name: 'Cash', balance: 0 },
        { id: 'w', userId: ada.id, name: 'Cash', balance: 0 },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it('reverses a withdrawal only once when two deletions race', async () => {
    const ada = signIn('delete-race');
    await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        yield* pocket.createWallet(account, { id: 'w', name: 'Cash' });
        yield* pocket.post(account, {
          id: 'in',
          walletId: 'w',
          amount: 100,
          note: '',
        });
        yield* pocket.post(account, {
          id: 'out',
          walletId: 'w',
          amount: -25,
          note: '',
        });
      }),
    );
    const transact = pocketTable.transact;
    const both = Deferred.makeUnsafe<void>();
    const first = Deferred.makeUnsafe<void>();
    let calls = 0;
    const spy = vi.spyOn(pocketTable, 'transact').mockImplementation(
      (ops) =>
        Effect.gen(function* () {
          if (++calls === 1) {
            yield* Deferred.await(both);
            return yield* transact(ops).pipe(
              Effect.tap(() => Deferred.succeed(first, undefined)),
            );
          }
          yield* Deferred.succeed(both, undefined);
          yield* Deferred.await(first);
          return yield* transact(ops);
        }) as ReturnType<typeof transact>,
    );
    try {
      await as(ada, (pocket, account) =>
        Effect.all(
          [
            pocket.deleteEntry(account, { id: 'out' }),
            pocket.deleteEntry(account, { id: 'out' }),
          ],
          { concurrency: 'unbounded' },
        ),
      );
      expect(await balances(ada)).toEqual({ w: 100 });
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses an overdraft and writes nothing', async () => {
    const ada = signIn('ada');
    const before = await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        yield* pocket.createWallet(account, { id: 'cash', name: 'Cash' });
        yield* pocket.createWallet(account, { id: 'bank', name: 'Bank' });
        yield* pocket.post(account, {
          id: 'in',
          walletId: 'cash',
          amount: 100,
          note: '',
        });
        yield* pocket.post(account, {
          id: 'out',
          walletId: 'cash',
          amount: -80,
          note: '',
        });
        return yield* pocket.entries(account, null);
      }),
    );
    const refusals = await as(ada, (pocket, account) =>
      Effect.all([
        Effect.flip(
          pocket.post(account, {
            id: 'big',
            walletId: 'cash',
            amount: -21,
            note: '',
          }),
        ),
        Effect.flip(
          pocket.transfer(account, {
            id: 'big',
            from: 'cash',
            to: 'bank',
            amount: 21,
            note: '',
          }),
        ),
        // Without the deposit, the withdrawal would take Cash below zero.
        Effect.flip(pocket.deleteEntry(account, { id: 'in' })),
      ]),
    );
    expect(refusals).toMatchObject([
      { _tag: 'Overdraft', walletId: 'cash', balance: 20, amount: -21 },
      { _tag: 'Overdraft', walletId: 'cash', balance: 20, amount: -21 },
      { _tag: 'Overdraft', walletId: 'cash', balance: 20, amount: -100 },
    ]);
    expect(
      await as(ada, (pocket, account) => pocket.entries(account, null)),
    ).toEqual(before);
    expect(await balances(ada)).toEqual({ cash: 20, bank: 0 });
  });

  it("lets nobody reach another User's records", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (pocket, account) =>
      Effect.gen(function* () {
        yield* pocket.createWallet(account, { id: 'w', name: 'Cash' });
        yield* pocket.post(account, {
          id: 'e',
          walletId: 'w',
          amount: 100,
          note: '',
        });
      }),
    );
    const refusals = await as(bob, (pocket, account) =>
      Effect.all([
        Effect.flip(pocket.renameWallet(account, { id: 'w', name: 'Mine' })),
        Effect.flip(
          pocket.post(account, { id: 'x', walletId: 'w', amount: 1, note: '' }),
        ),
        Effect.flip(pocket.deleteEntry(account, { id: 'e' })),
      ]),
    );
    expect(refusals).toMatchObject([
      { _tag: 'NotFound', kind: 'wallet', id: 'w' },
      { _tag: 'NotFound', kind: 'wallet', id: 'w' },
      { _tag: 'NotFound', kind: 'entry', id: 'e' },
    ]);
    // Bob's wallet of the same id is his own.
    await as(bob, (pocket, account) =>
      pocket.createWallet(account, { id: 'w', name: 'Bob' }),
    );
    const [adas] = await as(ada, (pocket, account) =>
      pocket.wallets(account, null),
    );
    expect(adas?.value).toMatchObject({ name: 'Cash', balance: 100 });
    expect(
      await browse(null, (pocket) => Effect.flip(pocket.wallets(ada.id, null))),
    ).toMatchObject({ _tag: 'Unauthenticated' });
  });

  it('reads an Entry stored at v1 as v2, its kind told by its sign', async () => {
    const ada = signIn('ada');
    // The pocket table as it was before Entries had a kind.
    const EntryV1 = EntityESchema.make('Entry', 'id', {
      userId: Schema.String,
      walletId: Schema.String,
      amount: Schema.Int,
      note: Schema.String,
    }).build();
    const before = StdTable.make('pocket')
      .primary('pk', 'sk')
      .lsi('LSI1', 'LSI1SK')
      .build();
    const entriesV1 = before
      .entity(EntryV1)
      .primary({ pk: ['userId'] })
      .index('LSI1', 'byUpdate', { sk: ['_u'] })
      .build();
    await Effect.runPromise(
      Effect.forEach(
        [
          { id: 'old-in', amount: 500 },
          { id: 'old-out', amount: -200 },
        ],
        (entry) =>
          entriesV1.insert({
            ...entry,
            userId: ada.id,
            walletId: 'w',
            note: '',
          }),
      ).pipe(
        Effect.provide(
          SQLite.make(before, { database: makeD1SQLite({ database: binding }) })
            .layer,
        ),
      ),
    );
    const read = await as(ada, (pocket, account) =>
      pocket.entries(account, null),
    );
    expect(
      read.map(({ value, meta }) => [
        value.id,
        value.kind,
        value.transferId,
        meta._v,
      ]),
    ).toEqual([
      ['old-in', 'deposit', null, 'v2'],
      ['old-out', 'withdrawal', null, 'v2'],
    ]);
  });

  it("refuses a call meant for one Account once the cookie is another's", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(bob, (pocket, account) =>
      pocket.createWallet(account, { id: 'w', name: 'Bob' }),
    );
    // The cookie and the Active Account are Bob's now; Ada's Instance still calls.
    const refused = await browse(
      bob,
      (pocket) =>
        Effect.all([
          Effect.flip(pocket.wallets(ada.id, null)),
          Effect.flip(pocket.createWallet(ada.id, { id: 'a', name: 'Ada' })),
        ]),
      bob.id,
    );
    expect(refused).toMatchObject([
      { _tag: 'AccountChanged' },
      { _tag: 'AccountChanged' },
    ]);
    expect(
      (await as(bob, (pocket, account) => pocket.wallets(account, null))).map(
        ({ value }) => value.id,
      ),
    ).toEqual(['w']);
  });

  it("answers the site's preflight, and lets no other origin read it", async () => {
    const answer = serve(testAuth(null), SITE, binding);
    const preflight = await answer(
      new Request('https://pocket.test/', {
        method: 'OPTIONS',
        headers: {
          origin: SITE,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, expect-user',
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    const elsewhere = await answer(
      new Request('https://pocket.test/', {
        method: 'OPTIONS',
        headers: { origin: 'https://elsewhere.test' },
      }),
    );
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  });
});
