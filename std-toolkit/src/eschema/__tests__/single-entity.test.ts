import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { SingleEntityESchema } from '../index.js';
import { ESchemaError } from '../utils.js';
import { StringToNumber } from './fixtures.js';

describe('SingleEntityESchema.make', () => {
  it('exposes name property', () => {
    const schema = SingleEntityESchema.make('Config', {
      key: Schema.String,
    }).build();

    expect(schema.name).toBe('Config');
  });

  itEffect('creates a v1 schema and encodes with version', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Settings', {
        theme: Schema.String,
        fontSize: Schema.Number,
      }).build();

      const encoded = yield* schema.encode({ theme: 'dark', fontSize: 14 });
      expect(encoded).toEqual({ _v: 'v1', theme: 'dark', fontSize: 14 });
    }),
  );

  itEffect('decodes v1 data', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        key: Schema.String,
        value: StringToNumber,
      }).build();

      const decoded = yield* schema.decode({
        _v: 'v1',
        key: 'limit',
        value: '100',
      });
      expect(decoded).toEqual({ key: 'limit', value: 100 });
    }),
  );

  itEffect('defaults to latest version when _v is missing', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        key: Schema.String,
      }).build();

      const decoded = yield* schema.decode({ key: 'test' });
      expect(decoded).toEqual({ key: 'test' });
    }),
  );

  itEffect('fails on unknown version', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        key: Schema.String,
      }).build();

      const error = yield* Effect.flip(
        schema.decode({ _v: 'v99', key: 'test' }),
      );
      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe('Unknown schema version: v99');
    }),
  );
});

describe('SingleEntityESchema.evolve', () => {
  itEffect('migrates v1 → v2', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        key: Schema.String,
      })
        .evolve('v2', { value: Schema.String }, (v) => ({
          ...v,
          value: 'default',
        }))
        .build();

      expect(schema.name).toBe('Config');

      const decoded = yield* schema.decode({ _v: 'v1', key: 'test' });
      expect(decoded).toEqual({ key: 'test', value: 'default' });
    }),
  );

  itEffect('chains v1 → v2 → v3', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        a: Schema.String,
      })
        .evolve('v2', { b: Schema.Number }, (v) => ({ ...v, b: 0 }))
        .evolve('v3', { c: Schema.Boolean }, (v) => ({ ...v, c: false }))
        .build();

      const fromV1 = yield* schema.decode({ _v: 'v1', a: 'x' });
      expect(fromV1).toEqual({ a: 'x', b: 0, c: false });

      const fromV3 = yield* schema.decode({
        _v: 'v3',
        a: 'x',
        b: 1,
        c: true,
      });
      expect(fromV3).toEqual({ a: 'x', b: 1, c: true });
    }),
  );

  itEffect('handles field removal', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        old: Schema.String,
        keep: Schema.String,
      })
        .evolve('v2', { old: null }, (v) => ({ keep: v.keep }))
        .build();

      const decoded = yield* schema.decode({
        _v: 'v1',
        old: 'gone',
        keep: 'stays',
      });
      expect(decoded).toEqual({ keep: 'stays' });
    }),
  );
});

describe('SingleEntityESchema fields/schema/makePartial', () => {
  it('fields returns the latest schema fields', () => {
    const schema = SingleEntityESchema.make('Config', {
      a: Schema.String,
      b: Schema.Number,
    }).build();

    expect(Object.keys(schema.fields).sort()).toEqual(['a', 'b']);
  });

  it('schema returns an Effect Schema.Struct', () => {
    const schema = SingleEntityESchema.make('Config', {
      key: Schema.String,
    }).build();

    expect(Object.keys(schema.schema.fields)).toEqual(['key']);
  });

  it('makePartial attaches version', () => {
    const schema = SingleEntityESchema.make('Config', {
      a: Schema.String,
      b: Schema.Number,
    }).build();

    expect(schema.makePartial({ a: 'hi' })).toEqual({ a: 'hi', _v: 'v1' });
  });
});

describe('SingleEntityESchema roundtrip', () => {
  itEffect('encode → decode preserves data', () =>
    Effect.gen(function* () {
      const schema = SingleEntityESchema.make('Config', {
        key: Schema.String,
        count: StringToNumber,
      }).build();

      const encoded = yield* schema.encode({ key: 'limit', count: 50 });
      const decoded = yield* schema.decode(encoded);
      expect(decoded).toEqual({ key: 'limit', count: 50 });
    }),
  );
});

describe('SingleEntityESchema.getDescriptor', () => {
  it('returns JSON Schema with name-related fields and version', () => {
    const schema = SingleEntityESchema.make('Config', {
      key: Schema.String,
    }).build();

    const descriptor = schema.getDescriptor();
    expect(descriptor.type).toBe('object');
    expect(descriptor.properties).toHaveProperty('key');
    expect(descriptor.properties).toHaveProperty('_v');
    const vSchema = descriptor.properties._v as { enum?: string[] };
    expect(vSchema.enum).toEqual(['v1']);
  });
});
