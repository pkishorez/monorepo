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
  'delete removes, leaving neighbours intact',
  'delete one id or clear the whole drawer',
  () => {
    vtest(
      'delete removes only the targeted id',
      'a precise delete leaves the rest of the collection untouched',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(user('u1', 'Ada'));
            yield* users.put(user('u2', 'Grace'));

            yield* users.delete('u1');

            const gone = yield* users.get('u1');
            const kept = yield* users.get('u2');
            if (Option.isSome(gone)) throw new Error('u1 should be gone');
            if (Option.isNone(kept)) throw new Error('u2 should remain');
          }),
        ),
    );

    vtest(
      'deleteAll empties the whole collection',
      'one call clears the drawer',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(user('u1', 'Ada'));
            yield* users.put(user('u2', 'Grace'));

            yield* users.deleteAll();

            const all = yield* users.getAll();
            if (all.length !== 0) throw new Error('expected empty after clear');
          }),
        ),
    );
  },
);
