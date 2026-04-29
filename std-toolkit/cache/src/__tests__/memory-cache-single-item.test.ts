import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Option } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { MemoryCacheSingleItem } from '../memory/memory-cache-single-item.js';

type Config = { theme: string; locale: string };

function makeConfigEntity(theme: string, locale: string): EntityType<Config> {
  return {
    value: { theme, locale },
    meta: {
      _e: 'Config',
      _v: 'v1',
      _u: `uid-${Date.now()}`,
      _d: false,
    },
  };
}

describe('MemoryCacheSingleItem', () => {
  itEffect('should create via make factory', () =>
    Effect.gen(function* () {
      const config = yield* MemoryCacheSingleItem.make<Config>({
        name: 'Config',
      });
      expect(config).toBeInstanceOf(MemoryCacheSingleItem);
    }),
  );

  itEffect('should put and get a single item', () =>
    Effect.gen(function* () {
      const config = yield* MemoryCacheSingleItem.make<Config>({
        name: 'Config',
      });

      yield* config.put(makeConfigEntity('dark', 'en-US'));

      const retrieved = yield* config.get();
      expect(Option.isSome(retrieved)).toBe(true);
      if (Option.isSome(retrieved)) {
        expect(retrieved.value.value.theme).toBe('dark');
        expect(retrieved.value.value.locale).toBe('en-US');
      }
    }),
  );

  itEffect('should return none when empty', () =>
    Effect.gen(function* () {
      const config = yield* MemoryCacheSingleItem.make<Config>({
        name: 'Config',
      });

      const retrieved = yield* config.get();
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  itEffect('should delete the item', () =>
    Effect.gen(function* () {
      const config = yield* MemoryCacheSingleItem.make<Config>({
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
      const config = yield* MemoryCacheSingleItem.make<Config>({
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
});
