import { MemoryCache } from '@std-toolkit/cache/memory';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type User = { id: string; name: string };

vdescribe(
  'recency queries on an empty collection return None',
  'there is no newest or oldest when the drawer is empty',
  () => {
    vtest(
      'getLatest is None on an empty collection',
      'absence is a valid answer, not an error',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            const latest = yield* users.getLatest();
            if (Option.isSome(latest)) throw new Error('expected None');
          }),
        ),
    );

    vtest(
      'getOldest is None on an empty collection',
      'the oldest query is empty-safe too',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const users = yield* new MemoryCache().entity<User>({
              name: 'User',
              idField: 'id',
            });
            const oldest = yield* users.getOldest();
            if (Option.isSome(oldest)) throw new Error('expected None');
          }),
        ),
    );
  },
);
