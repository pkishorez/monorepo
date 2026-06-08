import type { EntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { Effect } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type User = { id: string; name: string };

const user = (id: string, name: string): EntityType<User> => ({
  value: { id, name },
  meta: { _e: 'User', _v: 'v1', _u: id, _d: false },
});

vdescribe(
  'getAll returns the whole drawer',
  'read every record of one kind in a single call',
  () => {
    vtest(
      'every put shows up in getAll',
      'three distinct ids yield three records',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(user('u1', 'Ada'));
            yield* users.put(user('u2', 'Grace'));
            yield* users.put(user('u3', 'Edsger'));

            const all = yield* users.getAll();
            const ids = all.map((u) => u.value.id).sort();
            if (ids.join(',') !== 'u1,u2,u3') {
              throw new Error(`unexpected ids: ${ids.join(',')}`);
            }
          }),
        ),
    );

    vtest(
      'getAll on an empty collection is an empty array',
      'emptiness is [], not an error',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            const all = yield* users.getAll();
            if (all.length !== 0) throw new Error('expected empty');
          }),
        ),
    );
  },
);
