import { it, describe, expect } from '@effect/vitest';
import { Schema } from 'effect';
import { EntityMetaSchema } from '../entity/index.js';

import { Effect } from 'effect';

describe('Core', () => {
  describe('rpc', () => {
    it.effect('works with Effect', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('hello');
        expect(result).toBe('hello');
      }),
    );
  });

  describe('EntityMetaSchema', () => {
    const baseMeta = {
      _e: 'item',
      _v: 'v1',
      _d: false,
      _u: '2024-01-01T00:00:00.000Z',
    };
    const decode = Schema.decodeUnknownSync(EntityMetaSchema);

    it('decodes the four meta fields', () => {
      expect(decode(baseMeta)).toEqual(baseMeta);
    });
  });
});
