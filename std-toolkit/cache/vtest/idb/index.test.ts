import 'fake-indexeddb/auto';

import { expect } from 'vitest';
import { Effect, Option } from 'effect';
import type { EntityType, SingleEntityType } from '@std-toolkit/core';

import { vdescribe, vtest } from '@monorepo/vtest';
import {
  IDBCache,
  IDBCacheEntity,
  IDBCacheSingleItem,
} from '@std-toolkit/cache/idb';

type User = { id: string; name: string };
type Post = { id: string; title: string };
type Settings = { theme: string };

let dbCounter = 0;
const nextDb = () => `vtest-db-${++dbCounter}`;

const user = (id: string, name: string, u: string): EntityType<User> => ({
  value: { id, name },
  meta: { _e: 'User', _v: 'v1', _u: u, _d: false },
});

const post = (id: string, title: string, u: string): EntityType<Post> => ({
  value: { id, title },
  meta: { _e: 'Post', _v: 'v1', _u: u, _d: false },
});

const settings = (theme: string, u: string): SingleEntityType<Settings> => ({
  value: { theme },
  meta: { _e: 'Settings', _v: 'v1', _u: u },
});

vdescribe(
  'IDBCache facade',
  '`IDBCache#entity` and `#singleItem` open the underlying database lazily and return working backend instances.',
  () => {
    vtest(
      'entity() returns a usable IDBCacheEntity',
      'A facade-issued entity round-trips a put/get without further setup.',
      async () => {
        const cache = new IDBCache(nextDb(), 1);
        const users = await Effect.runPromise(
          cache.entity<User>({ name: 'User', idField: 'id' }),
        );
        expect(users).toBeInstanceOf(IDBCacheEntity);

        await Effect.runPromise(users.put(user('u1', 'Alice', 'uid-1')));
        const got = await Effect.runPromise(users.get('u1'));
        expect(Option.isSome(got)).toBe(true);
      },
    );

    vtest(
      'singleItem() returns a usable IDBCacheSingleItem',
      'A facade-issued slot round-trips a put/get without further setup.',
      async () => {
        const cache = new IDBCache(nextDb(), 1);
        const slot = await Effect.runPromise(
          cache.singleItem<Settings>({ name: 'Settings' }),
        );
        expect(slot).toBeInstanceOf(IDBCacheSingleItem);

        await Effect.runPromise(slot.put(settings('dark', 'uid-1')));
        const got = await Effect.runPromise(slot.get());
        expect(Option.isSome(got)).toBe(true);
      },
    );
  },
);

vdescribe(
  'IDBCacheEntity put/get round-trip',
  '`put` then `get` returns `Option.some({ value, meta })`; a missing id returns `Option.none()`.',
  () => {
    vtest(
      'put then get returns the stored value and meta',
      'Both `value` and `meta` survive serialization into IndexedDB and back.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
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
      'A cache miss is reported as `None`; no error is raised.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
        );
        const got = await Effect.runPromise(users.get('missing'));
        expect(Option.isNone(got)).toBe(true);
      },
    );

    vtest(
      'getAll returns every row for the entity name',
      'Three puts under one name produce three rows in `getAll`.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
        );
        await Effect.runPromise(users.put(user('u1', 'A', 'uid-1')));
        await Effect.runPromise(users.put(user('u2', 'B', 'uid-2')));
        await Effect.runPromise(users.put(user('u3', 'C', 'uid-3')));

        const all = await Effect.runPromise(users.getAll());
        expect(all.map((u) => u.value.id).sort()).toEqual(['u1', 'u2', 'u3']);
      },
    );
  },
);

vdescribe(
  'IDBCacheEntity name isolation',
  'Each entity is keyed by `[name, id]` and queried over a name-bounded `IDBKeyRange`, so entities under different names in the same DB do not see each other.',
  () => {
    vtest(
      'two entities under different names do not share rows',
      'A `User` `getAll` returns only `User` rows even though `Post` rows live in the same DB.',
      async () => {
        const dbName = nextDb();
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName,
            name: 'User',
            idField: 'id',
          }),
        );
        const posts = await Effect.runPromise(
          IDBCacheEntity.make<Post>({
            dbName,
            name: 'Post',
            idField: 'id',
          }),
        );

        await Effect.runPromise(users.put(user('u1', 'Alice', 'uid-1')));
        await Effect.runPromise(posts.put(post('p1', 'Hello', 'uid-2')));

        const allUsers = await Effect.runPromise(users.getAll());
        const allPosts = await Effect.runPromise(posts.getAll());
        expect(allUsers).toHaveLength(1);
        expect(allPosts).toHaveLength(1);
        expect(allUsers[0]?.value.id).toBe('u1');
        expect(allPosts[0]?.value.id).toBe('p1');
      },
    );
  },
);

vdescribe(
  'IDBCacheEntity _u-ordered retrieval',
  '`getLatest` / `getOldest` open a cursor on `UPDATED_INDEX` bounded to the name range — first hit is the answer.',
  () => {
    vtest(
      'getLatest returns the largest _u within the entity name',
      'Insertion order does not affect the result.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
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
      'getOldest returns the smallest _u within the entity name',
      'Symmetric to `getLatest`, just walking the cursor in the other direction.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
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
      'empty range → getLatest / getOldest return Option.none()',
      'An empty cursor on the name-bounded range degrades to `None`, matching the in-memory backend.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
        );
        expect(Option.isNone(await Effect.runPromise(users.getLatest()))).toBe(
          true,
        );
        expect(Option.isNone(await Effect.runPromise(users.getOldest()))).toBe(
          true,
        );
      },
    );
  },
);

vdescribe(
  'IDBCacheEntity deletion',
  '`delete` removes a single row by id; `deleteAll` walks the name-bounded cursor and deletes every entry.',
  () => {
    vtest(
      'delete of a known id removes the row',
      'A subsequent `get` for the same id returns `None`; other rows remain.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
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
      'deleteAll clears the name-bounded range',
      'After `deleteAll`, `getAll` is empty and `getLatest` is `None`.',
      async () => {
        const users = await Effect.runPromise(
          IDBCacheEntity.make<User>({
            dbName: nextDb(),
            name: 'User',
            idField: 'id',
          }),
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
  'IDBCacheSingleItem holds at most one value',
  'Single-slot reads and writes round-trip through IDB; `delete` empties the slot.',
  () => {
    vtest(
      'get on a fresh slot returns Option.none()',
      'An unwritten slot reads as empty.',
      async () => {
        const slot = await Effect.runPromise(
          IDBCacheSingleItem.make<Settings>({
            dbName: nextDb(),
            name: 'Settings',
          }),
        );
        const got = await Effect.runPromise(slot.get());
        expect(Option.isNone(got)).toBe(true);
      },
    );

    vtest(
      'put then get round-trips the value and meta',
      'Both fields survive the IDB round-trip.',
      async () => {
        const slot = await Effect.runPromise(
          IDBCacheSingleItem.make<Settings>({
            dbName: nextDb(),
            name: 'Settings',
          }),
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
      'delete empties the slot',
      'After `delete`, `get` returns `None`.',
      async () => {
        const slot = await Effect.runPromise(
          IDBCacheSingleItem.make<Settings>({
            dbName: nextDb(),
            name: 'Settings',
          }),
        );
        await Effect.runPromise(slot.put(settings('dark', 'uid-1')));
        await Effect.runPromise(slot.delete());
        const got = await Effect.runPromise(slot.get());
        expect(Option.isNone(got)).toBe(true);
      },
    );
  },
);
