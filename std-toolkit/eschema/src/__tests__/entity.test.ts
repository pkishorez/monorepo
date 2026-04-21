import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { EntityESchema } from '../index.js';
import { StringToNumber } from './fixtures.js';

describe('EntityESchema.make', () => {
  itEffect('creates a v1 schema with name and id field', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('User', 'id', {
        name: Schema.String,
      }).build();

      expect(schema.idField).toBe('id');
      const encoded = yield* schema.encode({ id: 'u1', name: 'Alice' });
      expect(encoded).toEqual({ _v: 'v1', id: 'u1', name: 'Alice' });
    }),
  );

  itEffect('supports complex field types', () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make('Complex', 'id', {
        count: StringToNumber,
        optional: Schema.optionalWith(Schema.String, {
          default: () => 'default',
        }),
        nullable: Schema.NullOr(Schema.String),
      }).build();

      const decoded = yield* schema.decode({
        _v: 'v1',
        id: 'c1',
        count: '42',
        nullable: null,
      });
      expect(decoded).toEqual({
        id: 'c1',
        count: 42,
        optional: 'default',
        nullable: null,
      });
    }),
  );

  it('supports custom id field names', () => {
    const schema = EntityESchema.make('User', 'userId', {
      name: Schema.String,
    }).build();

    expect(schema.idField).toBe('userId');
  });
});

describe('ESchema.fields getter', () => {
  it('returns the latest schema fields including id', () => {
    const schema = EntityESchema.make('Test', 'id', {
      a: Schema.String,
    }).build();

    expect(Object.keys(schema.fields)).toEqual(['a', 'id']);
  });

  it('returns evolved schema fields after evolution', () => {
    const schema = EntityESchema.make('Test', 'id', {
      a: Schema.String,
    })
      .evolve('v2', { b: Schema.Number }, (v) => ({ ...v, b: 0 }))
      .build();

    expect(Object.keys(schema.fields).sort()).toEqual(['a', 'b', 'id']);
  });
});

describe('ESchema.schema getter', () => {
  it('returns an Effect Schema.Struct with ID field', () => {
    const eschema = EntityESchema.make('Test', 'id', {
      a: Schema.String,
    }).build();

    const effectSchema = eschema.schema;
    expect(effectSchema.fields).toBeDefined();
    expect(Object.keys(effectSchema.fields)).toEqual(['a', 'id']);
  });
});

describe('EntityESchema.makePartial', () => {
  it('returns partial value with version', () => {
    const schema = EntityESchema.make('Test', 'id', {
      a: Schema.String,
      b: Schema.Number,
    }).build();

    const partial = schema.makePartial({ a: 'hello' });
    expect(partial).toEqual({ a: 'hello', _v: 'v1' });
  });

  it('allows empty partial', () => {
    const schema = EntityESchema.make('Test', 'id', {
      a: Schema.String,
    }).build();

    const partial = schema.makePartial({});
    expect(partial).toEqual({ _v: 'v1' });
  });
});

describe('ForbidIdField enforcement', () => {
  it('id field is auto-added and cannot be in user schema', () => {
    const schema = EntityESchema.make('Test', 'testId', {
      name: Schema.String,
    }).build();

    expect(schema.idField).toBe('testId');
    expect(Object.keys(schema.fields)).toContain('testId');
  });
});

describe('ID handling', () => {
  itEffect('decoded id is a plain string', () =>
    Effect.gen(function* () {
      const userSchema = EntityESchema.make('User', 'id', {
        name: Schema.String,
      }).build();

      const decoded = yield* userSchema.decode({ id: 'u1', name: 'Alice' });
      expect(decoded.id).toBe('u1');
    }),
  );

  itEffect('encoded id is a plain string', () =>
    Effect.gen(function* () {
      const userSchema = EntityESchema.make('User', 'id', {
        name: Schema.String,
      }).build();

      const encoded = yield* userSchema.encode({ id: 'u1', name: 'Alice' });
      expect(encoded.id).toBe('u1');

      const reEncoded = yield* userSchema.encode({
        id: encoded.id,
        name: 'Bob',
      });
      expect(reEncoded.id).toBe('u1');
    }),
  );
});
