import { it, describe, expect } from 'vitest';
import { Schema } from 'effect';
import { EntityMetaSchema } from '../entity-schema/index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect } from 'effect';

describe('Core', () => {
  describe('rpc', () => {
    itEffect('works with Effect', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('hello');
        expect(result).toBe('hello');
      }),
    );
  });

  describe('EntityMetaSchema', () => {
    const baseMeta = {
      _e: 'item',
      _d: false,
      _u: '2024-01-01T00:00:00.000Z',
    };
    const decode = Schema.decodeUnknownSync(EntityMetaSchema);

    it('decodes without _s and _c', () => {
      const result = decode(baseMeta);
      expect(result._s).toBeUndefined();
      expect(result._c).toBeUndefined();
    });

    it('decodes with _s and _c present', () => {
      const result = decode({
        ...baseMeta,
        _s: 1700000000000,
        _c: 1700000000050,
      });
      expect(result._s).toBe(1700000000000);
      expect(result._c).toBe(1700000000050);
    });
  });
});
