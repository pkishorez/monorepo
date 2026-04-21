import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { EntityESchema } from '../index.js';
import { StringToNumber } from './fixtures.js';

describe('ESchema.encode', () => {
  itEffect('encodes value with version metadata', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('User', 'id', {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({ id: 'u1', name: 'Alice' });
      expect(encoded).toEqual({ _v: 'v1', id: 'u1', name: 'Alice' });
    }),
  );

  itEffect('applies field transformations on encode', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Test', 'id', {
        count: StringToNumber,
      }).build();

      const encoded = yield* schema.encode({ id: 't1', count: 42 });
      expect(encoded).toEqual({ _v: 'v1', id: 't1', count: '42' });
    }),
  );

  itEffect('encodes with latest version after evolution', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Test', 'id', {
        a: Schema.String,
      })
        .evolve('v2', { b: Schema.Number }, (v) => ({ ...v, b: 0 }))
        .build();

      const encoded = yield* schema.encode({ id: 't1', a: 'hello', b: 123 });
      expect(encoded).toEqual({ _v: 'v2', id: 't1', a: 'hello', b: 123 });
    }),
  );

  itEffect('strips _v from input before encoding', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Test', 'id', {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({
        _v: 'old',
        id: 't1',
        name: 'test',
      } as any);
      expect(encoded).toEqual({ _v: 'v1', id: 't1', name: 'test' });
    }),
  );
});

describe('roundtrip encode/decode', () => {
  itEffect('preserves data through encode → decode cycle', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Test', 'id', {
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const original = { id: 't1', name: 'test', count: 42 };
      const encoded = yield* schema.encode(original);
      const decoded = yield* schema.decode(encoded);
      expect(decoded).toEqual({ id: 't1', name: 'test', count: 42 });
    }),
  );

  itEffect('preserves data through decode → encode cycle', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Test', 'id', {
        count: StringToNumber,
      }).build();

      const raw = { _v: 'v1', id: 't1', count: '123' };
      const decoded = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded);
      expect(encoded).toEqual({ _v: 'v1', id: 't1', count: '123' });
    }),
  );
});
