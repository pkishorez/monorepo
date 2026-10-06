import { Effect } from 'effect';
import { Authz } from '@kstackz/auth-toolkit/rpc';
import type { Entity } from '@kstackz/std-toolkit/core';
import {
  type Account,
  type Category,
  type Entry,
  sample,
} from '../../../shared/ledger/index.ts';
import { LedgerApi, LedgerError } from '../../../shared/ledger-api/index.ts';
import {
  accounts,
  categories,
  entries,
  preferences,
} from '../storage/index.ts';

// How many changes one Changes call returns; the browser asks again for more.
const PAGE = 500;

const failed = (code: LedgerError['code']) => () => new LedgerError({ code });

/** Runs `run` for the signed-in user, its storage failures as LedgerErrors. */
const asUser = <A, E, R>(run: (userId: string) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(Authz.CurrentAuth, ({ user }) => run(user.id)).pipe(
    Effect.mapError((error) =>
      error instanceof LedgerError ? error : failed('storage-error')(),
    ),
  );

// The three things the browser does with one kind, `V`, keyed by user.
const kindOf = <V extends { readonly id: string }>(
  entity: typeof accounts | typeof categories | typeof entries,
) => {
  // One loose view of the entities: each kind's own types meet only here.
  const any = entity as unknown as typeof entries;
  const typed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect as unknown as Effect.Effect<
      A extends ReadonlyArray<unknown> ? ReadonlyArray<Entity<V>> : Entity<V>,
      E,
      R
    >;
  return {
    changes: ({ after }: { readonly after: string | null }) =>
      asUser((userId) =>
        typed(
          any
            .query(
              'changes',
              { pk: { userId }, '>': after === null ? null : { _u: after } },
              { limit: PAGE },
            )
            .pipe(Effect.map((page) => page.items)),
        ),
      ),
    put: ({ value }: { readonly value: V }) =>
      asUser((userId) =>
        typed(
          Effect.gen(function* () {
            const own = { ...value, userId } as unknown as typeof Entry.Type;
            const key = { userId, id: value.id };
            const stored = yield* any.get(key);
            if (stored === null) return yield* any.insert(own);
            if (stored.meta._d) yield* any.restore(key);
            return yield* any.getAndUpdate(key, own);
          }),
        ),
      ),
    remove: ({ id }: { readonly id: string }) =>
      asUser((userId) => typed(any.delete({ userId, id }))),
  };
};

const account = kindOf<typeof Account.Type>(accounts);
const category = kindOf<typeof Category.Type>(categories);
const entry = kindOf<typeof Entry.Type>(entries);

// Everything of the user in one kind, deleted ones left out.
const all = (userId: string) =>
  Effect.all({
    accounts: accounts
      .query(
        'primary',
        { pk: { userId }, '>': null },
        { excludeDeleted: true, limit: 10_000 },
      )
      .pipe(Effect.map((page) => page.items)),
    categories: categories
      .query(
        'primary',
        { pk: { userId }, '>': null },
        { excludeDeleted: true, limit: 10_000 },
      )
      .pipe(Effect.map((page) => page.items)),
    entries: entries
      .query(
        'primary',
        { pk: { userId }, '>': null },
        { excludeDeleted: true, limit: 10_000 },
      )
      .pipe(Effect.map((page) => page.items)),
  });

export const LedgerHandlers = LedgerApi.toLayer({
  'Accounts.Changes': account.changes,
  'Accounts.Put': account.put,
  'Accounts.Delete': account.remove,
  'Categories.Changes': category.changes,
  'Categories.Put': category.put,
  'Categories.Delete': category.remove,
  'Entries.Changes': entry.changes,
  'Entries.Put': entry.put,
  'Entries.Delete': entry.remove,
  'Preferences.Changes': ({ after }) =>
    asUser((userId) =>
      preferences
        .query(
          'changes',
          { pk: { userId }, '>': after === null ? null : { _u: after } },
          { limit: PAGE },
        )
        .pipe(Effect.map((page) => page.items)),
    ),
  'Preferences.Put': ({ value }) =>
    asUser((userId) =>
      Effect.gen(function* () {
        const own = { ...value, userId };
        const stored = yield* preferences.get({ userId });
        return stored === null
          ? yield* preferences.insert(own)
          : yield* preferences.getAndUpdate({ userId }, own);
      }),
    ),
  'Preferences.Delete': () =>
    Effect.fail(new LedgerError({ code: 'not-found' })),
  'Ledger.Sample': ({ entries: withEntries }) =>
    asUser((userId) =>
      Effect.gen(function* () {
        const had = yield* all(userId);
        if (had.accounts.length > 0) return;
        const draft = sample(userId, new Date(), () => crypto.randomUUID());
        yield* Effect.forEach(
          draft.accounts,
          (value) => accounts.insert(value),
          { discard: true },
        );
        yield* Effect.forEach(
          draft.categories,
          (value) => categories.insert(value),
          { discard: true },
        );
        if (!withEntries) return;
        yield* Effect.forEach(draft.entries, (value) => entries.insert(value), {
          discard: true,
          concurrency: 8,
        });
      }),
    ),
  'Ledger.Clear': () =>
    asUser((userId) =>
      Effect.gen(function* () {
        const had = yield* all(userId);
        yield* Effect.forEach(
          had.entries,
          ({ value }) => entries.delete({ userId, id: value.id }),
          {
            discard: true,
            concurrency: 8,
          },
        );
        yield* Effect.forEach(
          had.categories,
          ({ value }) => categories.delete({ userId, id: value.id }),
          { discard: true },
        );
        yield* Effect.forEach(
          had.accounts,
          ({ value }) => accounts.delete({ userId, id: value.id }),
          { discard: true },
        );
      }),
    ),
});
