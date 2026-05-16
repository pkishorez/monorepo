import { expect } from 'vitest';
import { Effect, Option } from 'effect';
import type { EntityType, SingleEntityType } from '@std-toolkit/core';

import { vdescribe, vtest } from '@monorepo/vtest';
import {
  MemoryCache,
  MemoryCacheEntity,
  MemoryCacheSingleItem,
} from '@std-toolkit/cache/memory';

type User = { id: string; name: string };
type Settings = { theme: string };

const user = (id: string, name: string, u: string): EntityType<User> => ({
  value: { id, name },
  meta: { _e: 'User', _v: 'v1', _u: u, _d: false },
});

const settings = (theme: string, u: string): SingleEntityType<Settings> => ({
  value: { theme },
  meta: { _e: 'Settings', _v: 'v1', _u: u },
});

vdescribe(
  'MemoryCache facade',
  '`MemoryCache#entity` and `#singleItem` produce working backend instances; construction is infallible (`Effect<…, never>`).',
  () => {
    vtest(
      'entity() returns a usable MemoryCacheEntity',
      'A facade-issued entity round-trips a put/get without further setup.',
      async () => {
        const cache = new MemoryCache();
        const users = await Effect.runPromise(
          cache.entity<User>({ name: 'User', idField: 'id' }),
        );
        expect(users).toBeInstanceOf(MemoryCacheEntity);

        await Effect.runPromise(users.put(user('u1', 'Alice', 'uid-1')));
        const got = await Effect.runPromise(users.get('u1'));
        expect(Option.isSome(got)).toBe(true);
      },
    );

    vtest(
      'singleItem() returns a usable MemoryCacheSingleItem',
      'A facade-issued single-item slot round-trips a put/get without further setup.',
      async () => {
        const cache = new MemoryCache();
        const slot = await Effect.runPromise(
          cache.singleItem<Settings>({ name: 'Settings' }),
        );
        expect(slot).toBeInstanceOf(MemoryCacheSingleItem);

        await Effect.runPromise(slot.put(settings('dark', 'uid-1')));
        const got = await Effect.runPromise(slot.get());
        expect(Option.isSome(got)).toBe(true);
      },
    );
  },
);

vdescribe(
  'MemoryCacheEntity put/get round-trip',
  '`put` then `get` returns `Option.some({ value, meta })`; a missing id returns `Option.none()`.',
  () => {
    vtest(
      'put then get returns the stored value and meta',
      'Both `value` and `meta` are preserved verbatim across the round-trip.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('u1', 'Alice', 'uid-1')));
        const got = await Effect.runPromise(users.get('u1'));
        expect(Option.isSome(got)).toBe(true);
        if (Option.isSome(got)) {
          expect(got.value.value).toEqual({ id: 'u1', name: 'Alice' });
          expect(got.value.meta._u).toBe('uid-1');
          expect(got.value.meta._e).toBe('User');
        }
      },
    );

    vtest(
      'get of a missing id returns Option.none()',
      'No error is raised for a cache miss; callers branch on the option.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        const got = await Effect.runPromise(users.get('missing'));
        expect(Option.isNone(got)).toBe(true);
      },
    );

    vtest(
      'getAll returns every stored row',
      'Three distinct puts produce three rows in `getAll`.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('u1', 'A', 'uid-1')));
        await Effect.runPromise(users.put(user('u2', 'B', 'uid-2')));
        await Effect.runPromise(users.put(user('u3', 'C', 'uid-3')));

        const all = await Effect.runPromise(users.getAll());
        expect(all.map((u) => u.value.id).sort()).toEqual(['u1', 'u2', 'u3']);
      },
    );

    vtest(
      'put on an existing id replaces the row',
      'Repeated puts under the same id keep the store at length 1; the latest write wins.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('u1', 'Alice', 'uid-1')));
        await Effect.runPromise(users.put(user('u1', 'Alice II', 'uid-2')));

        const all = await Effect.runPromise(users.getAll());
        expect(all).toHaveLength(1);
        expect(all[0]?.value.name).toBe('Alice II');
      },
    );
  },
);

vdescribe(
  'MemoryCacheEntity _u-ordered retrieval',
  '`getLatest` / `getOldest` consult the `_u`-keyed `SortedMap`, not insertion order.',
  () => {
    vtest(
      'getLatest tracks the largest _u',
      'Inserting in arbitrary order, `getLatest` returns the row whose `_u` sorts last.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('a', 'A', 'uid-002')));
        await Effect.runPromise(users.put(user('b', 'B', 'uid-001')));
        await Effect.runPromise(users.put(user('c', 'C', 'uid-003')));

        const latest = await Effect.runPromise(users.getLatest());
        expect(Option.isSome(latest)).toBe(true);
        if (Option.isSome(latest)) {
          expect(latest.value.value.id).toBe('c');
          expect(latest.value.meta._u).toBe('uid-003');
        }
      },
    );

    vtest(
      'getOldest tracks the smallest _u',
      'The same store, queried for the oldest, returns the row whose `_u` sorts first.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('a', 'A', 'uid-002')));
        await Effect.runPromise(users.put(user('b', 'B', 'uid-001')));
        await Effect.runPromise(users.put(user('c', 'C', 'uid-003')));

        const oldest = await Effect.runPromise(users.getOldest());
        expect(Option.isSome(oldest)).toBe(true);
        if (Option.isSome(oldest)) {
          expect(oldest.value.value.id).toBe('b');
          expect(oldest.value.meta._u).toBe('uid-001');
        }
      },
    );

    vtest(
      'empty store → getLatest / getOldest return Option.none()',
      'Both endpoints degrade to `None` rather than throwing on an empty store.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        expect(Option.isNone(await Effect.runPromise(users.getLatest()))).toBe(
          true,
        );
        expect(Option.isNone(await Effect.runPromise(users.getOldest()))).toBe(
          true,
        );
      },
    );

    vtest(
      'put replaces the prior _u entry for the same id',
      'Updating a row removes its previous `_u` from the index before inserting the new one.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('a', 'A', 'uid-003')));
        await Effect.runPromise(users.put(user('b', 'B', 'uid-002')));
        await Effect.runPromise(users.put(user('a', 'A2', 'uid-001')));

        const latest = await Effect.runPromise(users.getLatest());
        expect(Option.isSome(latest)).toBe(true);
        if (Option.isSome(latest)) {
          expect(latest.value.value.id).toBe('b');
          expect(latest.value.meta._u).toBe('uid-002');
        }
      },
    );
  },
);

vdescribe(
  'MemoryCacheEntity deletion',
  '`delete` of an unknown id is a no-op; `deleteAll` clears both the store and the `_u` index.',
  () => {
    vtest(
      'delete of a known id removes the row',
      'The deleted id no longer appears in `get` or `getAll`.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('u1', 'A', 'uid-1')));
        await Effect.runPromise(users.put(user('u2', 'B', 'uid-2')));
        await Effect.runPromise(users.delete('u1'));

        const got = await Effect.runPromise(users.get('u1'));
        expect(Option.isNone(got)).toBe(true);
        const all = await Effect.runPromise(users.getAll());
        expect(all).toHaveLength(1);
      },
    );

    vtest(
      'delete of an unknown id is a no-op',
      'The call succeeds and the store is unchanged.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('u1', 'A', 'uid-1')));
        await Effect.runPromise(users.delete('missing'));

        const all = await Effect.runPromise(users.getAll());
        expect(all).toHaveLength(1);
      },
    );

    vtest(
      'deleteAll empties the store and the _u index',
      'A subsequent `getLatest` returns `None`; `getAll` is empty.',
      async () => {
        const users = await Effect.runPromise(
          MemoryCacheEntity.make<User>({ name: 'User', idField: 'id' }),
        );
        await Effect.runPromise(users.put(user('u1', 'A', 'uid-1')));
        await Effect.runPromise(users.put(user('u2', 'B', 'uid-2')));
        await Effect.runPromise(users.deleteAll());

        const all = await Effect.runPromise(users.getAll());
        expect(all).toHaveLength(0);
        expect(Option.isNone(await Effect.runPromise(users.getLatest()))).toBe(
          true,
        );
      },
    );
  },
);

vdescribe(
  'MemoryCacheSingleItem holds at most one value',
  'A single-slot store: `put` overwrites, `delete` empties, `get` reports `Option.none()` when empty.',
  () => {
    vtest(
      'get on a fresh slot returns Option.none()',
      'An unwritten slot reads as empty rather than throwing.',
      async () => {
        const slot = await Effect.runPromise(
          MemoryCacheSingleItem.make<Settings>({ name: 'Settings' }),
        );
        const got = await Effect.runPromise(slot.get());
        expect(Option.isNone(got)).toBe(true);
      },
    );

    vtest(
      'put then get round-trips the value and meta',
      'Both fields are preserved; subsequent reads see the same payload.',
      async () => {
        const slot = await Effect.runPromise(
          MemoryCacheSingleItem.make<Settings>({ name: 'Settings' }),
        );
        await Effect.runPromise(slot.put(settings('dark', 'uid-1')));
        const got = await Effect.runPromise(slot.get());
        expect(Option.isSome(got)).toBe(true);
        if (Option.isSome(got)) {
          expect(got.value.value).toEqual({ theme: 'dark' });
          expect(got.value.meta._u).toBe('uid-1');
        }
      },
    );

    vtest(
      'second put overwrites the slot',
      'There is no append semantics — the latest write wins.',
      async () => {
        const slot = await Effect.runPromise(
          MemoryCacheSingleItem.make<Settings>({ name: 'Settings' }),
        );
        await Effect.runPromise(slot.put(settings('dark', 'uid-1')));
        await Effect.runPromise(slot.put(settings('light', 'uid-2')));
        const got = await Effect.runPromise(slot.get());
        if (Option.isSome(got)) {
          expect(got.value.value.theme).toBe('light');
          expect(got.value.meta._u).toBe('uid-2');
        }
      },
    );

    vtest(
      'delete empties the slot',
      'After `delete`, a subsequent `get` returns `Option.none()`.',
      async () => {
        const slot = await Effect.runPromise(
          MemoryCacheSingleItem.make<Settings>({ name: 'Settings' }),
        );
        await Effect.runPromise(slot.put(settings('dark', 'uid-1')));
        await Effect.runPromise(slot.delete());
        const got = await Effect.runPromise(slot.get());
        expect(Option.isNone(got)).toBe(true);
      },
    );
  },
);
