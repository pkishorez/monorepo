import './setup.js';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Option } from 'effect';
import type { SingleEntityType } from '@std-toolkit/core';
import { IDBCacheSingleItem } from '../idb/idb-cache-single-item.js';

type Config = { theme: string; locale: string };

let dbCounter = 0;
const getDbName = () => `test-single-db-${++dbCounter}`;

function makeConfigEntity(
  theme: string,
  locale: string,
): SingleEntityType<Config> {
  return {
    value: { theme, locale },
    meta: {
      _e: 'Config',
      _v: 'v1',
      _u: `uid-${Date.now()}`,
    },
  };
}

describe('IDBCacheSingleItem', () => {
  itEffect('should open cache single item', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make<Config>({
        dbName: getDbName(),
        name: 'Config',
      });
      expect(config).toBeInstanceOf(IDBCacheSingleItem);
    }),
  );

  itEffect('should put and get a single item', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make<Config>({
        dbName: getDbName(),
        name: 'Config',
      });

      const item = makeConfigEntity('dark', 'en-US');
      yield* config.put(item);

      const retrieved = yield* config.get();
      expect(Option.isSome(retrieved)).toBe(true);
      if (Option.isSome(retrieved)) {
        expect(retrieved.value.value.theme).toBe('dark');
        expect(retrieved.value.value.locale).toBe('en-US');
        expect(retrieved.value.meta._e).toBe('Config');
      }
    }),
  );

  itEffect('should return none when empty', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make<Config>({
        dbName: getDbName(),
        name: 'Config',
      });

      const retrieved = yield* config.get();
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  itEffect('should delete the item', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make<Config>({
        dbName: getDbName(),
        name: 'Config',
      });

      yield* config.put(makeConfigEntity('dark', 'en-US'));
      yield* config.delete();

      const retrieved = yield* config.get();
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  itEffect('should overwrite on put', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make<Config>({
        dbName: getDbName(),
        name: 'Config',
      });

      yield* config.put(makeConfigEntity('dark', 'en-US'));
      yield* config.put(makeConfigEntity('light', 'fr-FR'));

      const retrieved = yield* config.get();
      expect(Option.isSome(retrieved)).toBe(true);
      if (Option.isSome(retrieved)) {
        expect(retrieved.value.value.theme).toBe('light');
        expect(retrieved.value.value.locale).toBe('fr-FR');
      }
    }),
  );

  itEffect('should isolate by name', () =>
    Effect.gen(function* () {
      const dbName = getDbName();
      const configA = yield* IDBCacheSingleItem.make<Config>({
        dbName,
        name: 'Config:tenant-a',
      });
      const configB = yield* IDBCacheSingleItem.make<Config>({
        dbName,
        name: 'Config:tenant-b',
      });

      yield* configA.put(makeConfigEntity('dark', 'en-US'));
      yield* configB.put(makeConfigEntity('light', 'fr-FR'));

      const retrievedA = yield* configA.get();
      const retrievedB = yield* configB.get();

      expect(Option.isSome(retrievedA)).toBe(true);
      expect(Option.isSome(retrievedB)).toBe(true);

      if (Option.isSome(retrievedA)) {
        expect(retrievedA.value.value.theme).toBe('dark');
      }
      if (Option.isSome(retrievedB)) {
        expect(retrievedB.value.value.theme).toBe('light');
      }
    }),
  );
});
