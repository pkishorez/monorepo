import { Effect, Option, Schema, Stream } from 'effect';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { Broadcaster, type Entity } from '@kstackz/std-toolkit/core';
import {
  type Account,
  type Category,
  type Entry,
  type Preferences,
  sample,
} from '../../model/index.ts';
import { LedgerApi, LedgerError } from '../../api/index.ts';
import {
  accounts,
  categories,
  entries,
  preferences,
} from '../services/table/index.ts';

// How many changes one call returns; the client asks again for more.
const PAGE = 500;

const failed = (code: LedgerError['code']) => () => new LedgerError({ code });

// A storage failure, as the client is told it.
const asLedgerError = (error: unknown) =>
  error instanceof LedgerError ? error : failed('storage-error')();

/** Runs `run` for the signed-in user, its storage failures as LedgerErrors. */
const asUser = <A, E, R>(run: (userId: string) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(Authz.Current, ({ user }) => run(user.id)).pipe(
    Effect.mapError(asLedgerError),
  );

// Where a Watch has got to, kept so it resumes there after the Durable
// Object wakes; elsewhere nothing is kept, as nothing sleeps.
const WatchCheckpoint = Schema.Struct({ after: Schema.NullOr(Schema.String) });

// The newest `_u` of `batch`, or `cursor` if none is newer.
const newestAfter = (
  cursor: string | null,
  batch: ReadonlyArray<Entity<unknown>>,
) =>
  batch.reduce<string | null>(
    (newest, { meta }) =>
      newest === null || meta._u > newest ? meta._u : newest,
    cursor,
  );

// One loose view of a kind's entity: each kind's own types meet only here.
type AnyKind = typeof entries;

/**
 * How every kind is read, for the signed-in user: each change after a
 * cursor, the page older than one, newest first, and every change after a
 * cursor and then each as it is made. `V` is the kind's value.
 */
const readsOf = <V>(kind: unknown) => {
  const entity = kind as AnyKind;
  const typed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect as unknown as Effect.Effect<ReadonlyArray<Entity<V>>, E, R>;
  const changes = (userId: string, after: string | null) =>
    entity
      .query(
        'changes',
        { pk: { userId }, '>': after === null ? null : { _u: after } },
        { limit: PAGE },
      )
      .pipe(Effect.map((page) => page.items));
  return {
    changes: ({ after }: { readonly after: string | null }) =>
      asUser((userId) => typed(changes(userId, after))),
    older: ({ before }: { readonly before: string | null }) =>
      asUser((userId) =>
        typed(
          entity
            .query(
              'changes',
              { pk: { userId }, '<': before === null ? null : { _u: before } },
              { limit: PAGE },
            )
            .pipe(Effect.map((page) => page.items)),
        ),
      ),
    // Listens before it replays, so no change falls between the two; one
    // that comes both ways reaches the client twice, which it ignores.
    watch: ({ after }: { readonly after: string | null }) =>
      Stream.unwrap(
        asUser((userId) =>
          Effect.gen(function* () {
            if (Option.isNone(yield* Effect.serviceOption(Broadcaster)))
              return yield* Effect.die(
                'This Backend hears no changes as they are made: build Ledger with the polling Sync Mode.',
              );
            const checkpoint = yield* Rpc.websocket.checkpoint(WatchCheckpoint);
            const saved = yield* checkpoint.get().pipe(Effect.orDie);
            let cursor = Option.match(saved, {
              onNone: () => after,
              onSome: (kept) => kept.after,
            });
            const replay = Stream.paginate(cursor, (from) =>
              changes(userId, from).pipe(
                Effect.map((page) => {
                  const next = newestAfter(from, page);
                  return [
                    [page],
                    page.length === PAGE ? Option.some(next) : Option.none(),
                  ] as const;
                }),
              ),
            );
            const live = entity
              .subscribe({ userId })
              .pipe(
                Stream.map(
                  (notice) => [notice] as ReadonlyArray<Entity<unknown>>,
                ),
              );
            return Stream.merge(live, replay).pipe(
              Stream.filter((batch) => batch.length > 0),
              Stream.mapEffect((batch) => {
                cursor = newestAfter(cursor, batch);
                return checkpoint
                  .put({ after: cursor })
                  .pipe(
                    Effect.orDie,
                    Effect.as(batch as ReadonlyArray<Entity<V>>),
                  );
              }),
              Stream.mapError(asLedgerError),
            );
          }),
        ),
      ),
  };
};

/** Writing and deleting one value of a kind keyed by `id`. */
const writesOf = <V extends { readonly id: string }>(kind: unknown) => {
  const entity = kind as AnyKind;
  const typed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect as unknown as Effect.Effect<Entity<V>, E, R>;
  return {
    put: ({ value }: { readonly value: V }) =>
      asUser((userId) =>
        typed(
          Effect.gen(function* () {
            const own = { ...value, userId } as unknown as Entry;
            const key = { userId, id: value.id };
            const stored = yield* entity.get(key);
            if (stored === null) return yield* entity.insert(own);
            if (stored.meta._d) yield* entity.restore(key);
            return yield* entity.getAndUpdate(key, own);
          }),
        ),
      ),
    remove: ({ id }: { readonly id: string }) =>
      asUser((userId) => typed(entity.delete({ userId, id }))),
  };
};

const account = {
  ...readsOf<Account>(accounts),
  ...writesOf<Account>(accounts),
};
const category = {
  ...readsOf<Category>(categories),
  ...writesOf<Category>(categories),
};
const entry = { ...readsOf<Entry>(entries), ...writesOf<Entry>(entries) };
const preference = readsOf<Preferences>(preferences);

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

/**
 * The Ledger API's handlers, the same wherever they run: D1, a Durable
 * Object or the device. A Watch needs a Broadcaster to hear writes as they
 * are made; without one it fails loudly rather than ending, which would
 * make the client poll in disguise.
 */
export const LedgerHandlers = LedgerApi.toLayer({
  AccountChanges: account.changes,
  AccountOlder: account.older,
  AccountWatch: account.watch,
  AccountPut: account.put,
  AccountDelete: account.remove,
  CategoryChanges: category.changes,
  CategoryOlder: category.older,
  CategoryWatch: category.watch,
  CategoryPut: category.put,
  CategoryDelete: category.remove,
  EntryChanges: entry.changes,
  EntryOlder: entry.older,
  EntryWatch: entry.watch,
  EntryPut: entry.put,
  EntryDelete: entry.remove,
  PreferencesChanges: preference.changes,
  PreferencesOlder: preference.older,
  PreferencesWatch: preference.watch,
  PreferencesPut: ({ value }) =>
    asUser((userId) =>
      Effect.gen(function* () {
        const own = { ...value, userId };
        const stored = yield* preferences.get({ userId });
        return stored === null
          ? yield* preferences.insert(own)
          : yield* preferences.getAndUpdate({ userId }, own);
      }),
    ),
  LedgerSample: ({ entries: withEntries }) =>
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
  LedgerClear: () =>
    asUser((userId) =>
      Effect.gen(function* () {
        const had = yield* all(userId);
        yield* Effect.forEach(
          had.entries,
          ({ value }) => entries.delete({ userId, id: value.id }),
          { discard: true, concurrency: 8 },
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
