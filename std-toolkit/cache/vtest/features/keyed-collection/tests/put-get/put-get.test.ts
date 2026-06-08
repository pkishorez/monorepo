import type { EntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type User = { id: string; name: string };

const user = (id: string, name: string): EntityType<User> => ({
  value: { id, name },
  meta: { _e: 'User', _v: 'v1', _u: id, _d: false },
});

vdescribe(
  'a collection is a set keyed by id',
  'put inserts, and put again on the same id replaces',
  () => {
    vtest(
      'get returns the stored record by id',
      'the simplest path: put one, read it back',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(user('u1', 'Ada'));

            const got = yield* users.get('u1');
            if (Option.isNone(got) || got.value.value.name !== 'Ada') {
              throw new Error('expected Ada');
            }
          }),
        ),
    );

    vtest(
      'get returns None for an unknown id',
      'a miss is an empty Option, never a thrown error',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            const got = yield* users.get('nope');
            if (Option.isSome(got)) throw new Error('expected a miss');
          }),
        ),
    );

    vtest(
      'putting the same id replaces rather than duplicates',
      'keys make put an upsert — the collection stays a set',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(user('u1', 'Ada'));
            yield* users.put(user('u1', 'Ada Lovelace'));

            const all = yield* users.getAll();
            if (all.length !== 1 || all[0]!.value.name !== 'Ada Lovelace') {
              throw new Error('expected one updated record');
            }
          }),
        ),
    );
  },
);
