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
  'put overwrites the slot and delete clears it',
  'singular means singular: no history, no list',
  () => {
    vtest(
      'a second put replaces the first',
      'the slot holds the latest value only',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const slot = yield* new MemoryCache().singleItem<Session>({
              name: 'Session',
            });
            yield* slot.put(session('old'));
            yield* slot.put(session('new'));

            const got = yield* slot.get();
            if (Option.isNone(got) || got.value.value.token !== 'new') {
              throw new Error('expected the newest value');
            }
          }),
        ),
    );

    vtest(
      'delete empties the slot back to None',
      'after delete the single item reads as absent again',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const slot = yield* new MemoryCache().singleItem<Session>({
              name: 'Session',
            });
            yield* slot.put(session('abc'));
            yield* slot.delete();

            const got = yield* slot.get();
            if (Option.isSome(got))
              throw new Error('expected empty after delete');
          }),
        ),
    );
  },
);
