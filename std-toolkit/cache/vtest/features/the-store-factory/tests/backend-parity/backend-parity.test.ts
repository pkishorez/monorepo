import type { CacheStore } from '@std-toolkit/cache';
import type { EntityType } from '@std-toolkit/core';
import { MemoryCache } from '@std-toolkit/cache/memory';
import { IDBCache } from '@std-toolkit/cache/idb';
import { Effect, Option } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type User = { id: string; name: string };

const env = (id: string, u: string): EntityType<User> => ({
  value: { id, name: id },
  meta: { _e: 'User', _v: 'v1', _u: u, _d: false },
});

const exercise = (store: CacheStore) =>
  Effect.gen(function* () {
    const users = yield* store.entity<User>({ name: 'User', idField: 'id' });
    yield* users.put(env('u1', 'k-001'));
    yield* users.put(env('u2', 'k-003'));
    yield* users.put(env('u3', 'k-002'));

    const all = yield* users.getAll();
    const latest = yield* users.getLatest();
    const latestId = Option.isSome(latest) ? latest.value.value.id : null;
    return { count: all.length, latestId };
  });

let db = 0;

vdescribe(
  'every backend implements one CacheStore interface',
  'the same operations give the same result on memory and on IndexedDB',
  () => {
    vtest(
      'memory and IndexedDB agree on count and latest',
      'swapping the backend is one line; behaviour does not change',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const fromMemory = yield* exercise(new MemoryCache());
            const fromIdb = yield* exercise(new IDBCache(`parity-${++db}`, 1));

            if (
              fromMemory.count !== fromIdb.count ||
              fromMemory.latestId !== fromIdb.latestId
            ) {
              throw new Error('backends disagreed');
            }
            if (fromMemory.count !== 3 || fromMemory.latestId !== 'u2') {
              throw new Error('unexpected result');
            }
          }),
        ),
    );
  },
);
