import { Context, Effect, Layer, Stream } from 'effect';
import { defaultBroadcaster, type Entity } from '@kestack/std-toolkit/core';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '@kestack/std-toolkit/db/sqlite/durable-object';
import type { Member } from '../../../../shared/contracts/member/index.ts';
import {
  credential,
  owner,
  type StoredCredential,
  userSpaceTable,
} from './table.ts';

/*
 * The User Space's records, on its Durable Object's SQLite: typed reads,
 * writes and subscriptions for the workflows. Every write is heard by every
 * subscription in this object, so a change reaches each of the user's open
 * tabs. A storage failure inside the user's own object is a defect.
 */

const sameMember = (a: Member | null, b: Member | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.userId === b.userId &&
    a.email === b.email &&
    a.name === b.name);

export class Storage extends Context.Service<
  Storage,
  {
    /** Who this User Space belongs to. */
    readonly owner: {
      /** As last recorded; null before their first call. */
      readonly get: Effect.Effect<Member | null>;
      /** Records them as verified at `at`, unless a later verification
       * is recorded, telling every subscription if anything changed;
       * answers who is recorded after. */
      readonly put: (member: Member, at: number) => Effect.Effect<Member>;
      /** As recorded now, then each time it changes. */
      readonly changes: Stream.Stream<Member | null>;
    };
    /** The owner's Provider credentials, oldest first; secrets only sealed. */
    readonly credentials: {
      readonly all: Effect.Effect<ReadonlyArray<StoredCredential>>;
      /** All of them now, then again after each change. */
      readonly changes: Stream.Stream<ReadonlyArray<StoredCredential>>;
      readonly get: (
        credentialId: string,
      ) => Effect.Effect<StoredCredential | null>;
      readonly insert: (
        record: StoredCredential,
      ) => Effect.Effect<StoredCredential>;
      /** Renames it at `at`; null when there is no such credential. */
      readonly rename: (
        credentialId: string,
        name: string,
        at: number,
      ) => Effect.Effect<StoredCredential | null>;
      /** Erases it, sealed secret and all; false when there was none. */
      readonly remove: (credentialId: string) => Effect.Effect<boolean>;
    };
  }
>()('alchemy-console/UserSpace/Storage') {
  /** The Storage of the Durable Object whose `storage` this is; its table is made on first use. */
  static readonly layer = (storage: DurableObjectSQLiteStorage) =>
    Layer.effect(
      Storage,
      Effect.gen(function* () {
        const database = makeDurableObjectSQLite({ storage });
        yield* SQLite.setup(userSpaceTable, { database }).pipe(Effect.orDie);
        const table = yield* Layer.build(
          Layer.merge(
            SQLite.make(userSpaceTable, { database }).layer,
            defaultBroadcaster,
          ),
        );
        const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(Effect.provideContext(table), Effect.orDie);

        const read = run(owner.get()).pipe(Effect.map(({ value }) => value));
        const get = Effect.map(read, ({ member }) => member);

        const all = Effect.gen(function* () {
          const found: Array<StoredCredential> = [];
          let after: Entity<StoredCredential> | undefined;
          while (true) {
            const page = yield* run(
              credential.query(
                'primary',
                { pk: {}, '>=': null },
                { excludeDeleted: true, ...(after ? { after } : {}) },
              ),
            );
            found.push(...page.items.map(({ value }) => value));
            after = page.items.at(-1);
            if (!page.hasMore || after === undefined) return found;
          }
        });

        return Storage.of({
          owner: {
            get,
            put: (member, at) =>
              Effect.gen(function* () {
                const current = yield* read;
                if (current.member !== null && current.at > at)
                  return current.member;
                // A newer word moves `at` on even when the member is the
                // same, so an older one can never undo it.
                if (current.member === null || at > current.at)
                  yield* run(owner.put({ member, at }));
                return member;
              }),
            changes: Stream.concat(
              Stream.fromEffect(get),
              owner.subscribe().pipe(
                Stream.map(({ value }) => value.member),
                Stream.provideContext(table),
              ),
            ).pipe(Stream.changesWith(sameMember)),
          },
          credentials: {
            all,
            changes: Stream.concat(
              Stream.fromEffect(all),
              credential.subscribe().pipe(
                Stream.provideContext(table),
                Stream.mapEffect(() => all),
              ),
            ),
            get: (credentialId) =>
              run(
                credential.get({ credentialId }, { excludeDeleted: true }),
              ).pipe(Effect.map((found) => found?.value ?? null)),
            insert: (record) =>
              run(credential.insert(record)).pipe(
                Effect.map(({ value }) => value),
              ),
            rename: (credentialId, name, at) =>
              Effect.gen(function* () {
                const found = yield* run(
                  credential.get({ credentialId }, { excludeDeleted: true }),
                );
                if (found === null) return null;
                const renamed = yield* run(
                  credential.getAndUpdate(
                    { credentialId },
                    { name, updatedAt: at },
                  ),
                );
                return renamed.value;
              }),
            remove: (credentialId) =>
              Effect.gen(function* () {
                const found = yield* run(credential.get({ credentialId }));
                if (found === null) return false;
                yield* run(
                  credential.hardDelete(
                    { credentialId },
                    'I KNOW WHAT I AM DOING',
                  ),
                );
                return true;
              }),
          },
        });
      }),
    );
}
