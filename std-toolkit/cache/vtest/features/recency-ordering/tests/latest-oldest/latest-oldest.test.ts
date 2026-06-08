import type { EntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type User = { id: string; name: string };

const env = (id: string, u: string): EntityType<User> => ({
  value: { id, name: id },
  meta: { _e: 'User', _v: 'v1', _u: u, _d: false },
});

vdescribe(
  'latest and oldest follow the _u update key',
  'ordering is by _u, not by insertion order',
  () => {
    vtest(
      'getLatest returns the record with the highest _u',
      'inserted out of order, the newest is still found by its update key',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(env('u1', 'k-001'));
            yield* users.put(env('u2', 'k-003'));
            yield* users.put(env('u3', 'k-002'));

            const latest = yield* users.getLatest();
            if (Option.isNone(latest) || latest.value.value.id !== 'u2') {
              throw new Error('expected u2 as latest');
            }
          }),
        ),
    );

    vtest(
      'getOldest returns the record with the lowest _u',
      'the same key drives the oldest query from the other end',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            yield* users.put(env('u1', 'k-002'));
            yield* users.put(env('u2', 'k-001'));
            yield* users.put(env('u3', 'k-003'));

            const oldest = yield* users.getOldest();
            if (Option.isNone(oldest) || oldest.value.value.id !== 'u2') {
              throw new Error('expected u2 as oldest');
            }
          }),
        ),
    );
  },
);
