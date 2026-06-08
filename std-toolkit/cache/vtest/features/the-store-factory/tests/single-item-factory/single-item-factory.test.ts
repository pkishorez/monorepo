import type { SingleEntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { IDBCache } from '@std-toolkit/cache/idb';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type Flags = { dark: boolean };

const flags = (dark: boolean): SingleEntityType<Flags> => ({
  value: { dark },
  meta: { _e: 'Flags', _v: 'v1', _u: 'k-001' },
});

let db = 0;

vdescribe(
  'singleItem is minted the same way on every backend',
  'the second factory method behaves identically across stores',
  () => {
    vtest(
      'a single item round-trips on memory and on IndexedDB alike',
      'ask the store, get a slot — the backend is irrelevant to the caller',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const memorySlot = yield* new MemoryCache().singleItem<Flags>({
              name: 'Flags',
            });
            const idbSlot = yield* new IDBCache(
              `single-${++db}`,
              1,
            ).singleItem<Flags>({ name: 'Flags' });

            yield* memorySlot.put(flags(true));
            yield* idbSlot.put(flags(true));

            const fromMemory = yield* memorySlot.get();
            const fromIdb = yield* idbSlot.get();
            const ok = (o: Option.Option<SingleEntityType<Flags>>) =>
              Option.isSome(o) && o.value.value.dark === true;

            if (!ok(fromMemory) || !ok(fromIdb)) {
              throw new Error('backends disagreed on the single item');
            }
          }),
        ),
    );
  },
);
