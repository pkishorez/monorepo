import { Context, Effect, Layer, Stream } from 'effect';
import { defaultBroadcaster } from '@kestack/std-toolkit/core';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '@kestack/std-toolkit/db/sqlite/durable-object';
import type { Member } from '../../../../shared/contracts/member/index.ts';
import { owner, userSpaceTable } from './table.ts';

/*
 * The User Space's records, on its Durable Object's SQLite: typed reads,
 * writes and subscriptions for the workflows. Every write is heard by every
 * subscription in this object, so a change reaches each of the user's open
 * tabs. A storage failure inside the user's own object is a defect.
 */

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
        const read = owner.get().pipe(
          Effect.map(({ value }) => value),
          Effect.provideContext(table),
          Effect.orDie,
        );
        const get = Effect.map(read, ({ member }) => member);
        return Storage.of({
          owner: {
            get,
            put: (member, at) =>
              Effect.gen(function* () {
                const current = yield* read;
                if (current.member !== null && current.at > at)
                  return current.member;
                const same =
                  current.member?.userId === member.userId &&
                  current.member.email === member.email &&
                  current.member.name === member.name;
                if (!same)
                  yield* owner
                    .put({ member, at })
                    .pipe(Effect.provideContext(table), Effect.orDie);
                return member;
              }),
            changes: Stream.concat(
              Stream.fromEffect(get),
              owner.subscribe().pipe(
                Stream.map(({ value }) => value.member),
                Stream.provideContext(table),
              ),
            ),
          },
        });
      }),
    );
}
