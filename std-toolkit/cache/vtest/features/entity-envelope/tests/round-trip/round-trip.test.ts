import type { EntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type User = { id: string; name: string };

const envelope = (id: string, name: string, u: string): EntityType<User> => ({
  value: { id, name },
  meta: { _e: 'User', _v: 'v1', _u: u, _d: false },
});

vdescribe(
  'the envelope round-trips unchanged',
  'put an EntityType and get back the same value and meta',
  () => {
    vtest(
      'value and meta survive a put/get round-trip',
      'the cache is a faithful courier: nothing in the envelope is altered',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            const stored = envelope('u1', 'Ada', 'k-001');
            yield* users.put(stored);

            const got = yield* users.get('u1');
            if (Option.isNone(got)) throw new Error('expected a record');
            if (
              got.value.value.name !== 'Ada' ||
              got.value.meta._u !== 'k-001' ||
              got.value.meta._d !== false
            ) {
              throw new Error('envelope was altered in transit');
            }
          }),
        ),
    );

    vtest(
      'the soft-delete flag is preserved, not acted on',
      'meta._d is data the cache carries — it does not hide the record itself',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put({
              value: { id: 'u1', name: 'Ada' },
              meta: { _e: 'User', _v: 'v1', _u: 'k-001', _d: true },
            });

            const got = yield* users.get('u1');
            if (Option.isNone(got))
              throw new Error('record should still exist');
            if (got.value.meta._d !== true) {
              throw new Error('soft-delete flag was not preserved');
            }
          }),
        ),
    );
  },
);
