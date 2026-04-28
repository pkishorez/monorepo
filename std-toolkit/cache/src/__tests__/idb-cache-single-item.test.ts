import './setup.js';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Option, Schema } from 'effect';
import { SingleEntityESchema, type ESchemaEncoded } from '@std-toolkit/eschema';
import type { EntityType } from '@std-toolkit/core';
import { IDBCacheSingleItem } from '../idb/idb-cache-single-item.js';

let dbCounter = 0;
const getDbName = () => `test-single-db-${++dbCounter}`;

const ConfigSchema = SingleEntityESchema.make('Config', {
  theme: Schema.String,
  locale: Schema.String,
}).build();

function makeConfigEntity(
  theme: string,
  locale: string,
): EntityType<ESchemaEncoded<typeof ConfigSchema>> {
  return {
    value: { theme, locale, _v: 'v1' as const },
    meta: {
      _e: ConfigSchema.name,
      _v: ConfigSchema.latestVersion,
      _u: `uid-${Date.now()}`,
      _d: false,
    },
  };
}

describe('IDBCacheSingleItem', () => {
  itEffect('should open cache single item', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make({
        name: getDbName(),
        eschema: ConfigSchema,
      });
      expect(config).toBeInstanceOf(IDBCacheSingleItem);
    }),
  );

  itEffect('should put and get a single item', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make({
        name: getDbName(),
        eschema: ConfigSchema,
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
      const config = yield* IDBCacheSingleItem.make({
        name: getDbName(),
        eschema: ConfigSchema,
      });

      const retrieved = yield* config.get();
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  itEffect('should delete the item', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make({
        name: getDbName(),
        eschema: ConfigSchema,
      });

      yield* config.put(makeConfigEntity('dark', 'en-US'));
      yield* config.delete();

      const retrieved = yield* config.get();
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  itEffect('should overwrite on put', () =>
    Effect.gen(function* () {
      const config = yield* IDBCacheSingleItem.make({
        name: getDbName(),
        eschema: ConfigSchema,
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

  itEffect('should isolate by partition', () =>
    Effect.gen(function* () {
      const dbName = getDbName();
      const configA = yield* IDBCacheSingleItem.make({
        name: dbName,
        eschema: ConfigSchema,
        partition: { tenantId: 'tenant-a' },
      });
      const configB = yield* IDBCacheSingleItem.make({
        name: dbName,
        eschema: ConfigSchema,
        partition: { tenantId: 'tenant-b' },
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
