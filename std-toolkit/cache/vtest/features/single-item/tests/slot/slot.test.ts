import type { SingleEntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type Session = { token: string };

const session = (token: string): SingleEntityType<Session> => ({
  value: { token },
  meta: { _e: 'Session', _v: 'v1', _u: 'k-001' },
});

vdescribe(
  'a single item is one slot read without an id',
  'put and get with no key at all',
  () => {
    vtest(
      'get on an empty slot is None',
      'an untouched single item reads as absent',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const slot = yield* new MemoryCache().singleItem<Session>({
              name: 'Session',
            });
            const got = yield* slot.get();
            if (Option.isSome(got)) throw new Error('expected empty slot');
          }),
        ),
    );

    vtest(
      'put then get returns the stored item',
      'no id is needed — there is only one record to read',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const slot = yield* new MemoryCache().singleItem<Session>({
              name: 'Session',
            });
            yield* slot.put(session('abc'));

            const got = yield* slot.get();
            if (Option.isNone(got) || got.value.value.token !== 'abc') {
              throw new Error('expected token abc');
            }
          }),
        ),
    );
  },
);
