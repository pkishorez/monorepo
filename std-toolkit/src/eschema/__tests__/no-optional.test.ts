import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import {
  ESchema,
  SingleEntityESchema,
  EntityESchema,
  ValueESchema,
  toSchema,
} from '../index.js';

const Child = ESchema.make('Child', { val: Schema.String }).build();

describe('optional and undefined are forbidden at the type level', () => {
  it('rejects optional fields, accepts NullOr', () => {
    // @ts-expect-error optionalKey is forbidden
    ESchema.make('A1', { child: Schema.optionalKey(toSchema(Child)) });
    // @ts-expect-error optional is forbidden
    ESchema.make('A2', { x: Schema.optional(Schema.String) });
    // @ts-expect-error UndefinedOr is forbidden
    ESchema.make('A3', { x: Schema.UndefinedOr(Schema.String) });
    // @ts-expect-error optional fields are forbidden in SingleEntityESchema
    SingleEntityESchema.make('A4', { x: Schema.optional(Schema.String) });
    // @ts-expect-error optional fields are forbidden in EntityESchema
    EntityESchema.make('A5', 'id', { x: Schema.optional(Schema.String) });
    // @ts-expect-error undefined-admitting value schema is forbidden
    ValueESchema.make('A6', Schema.UndefinedOr(Schema.String));

    ESchema.make('B1', { x: Schema.NullOr(Schema.String) }).build();
    const value = ValueESchema.make('B2', Schema.NullOr(Schema.String)).build();
    expect(value.latestVersion).toBe('v1');
  });

  it('rejects empty names at type level and runtime', () => {
    expect(() =>
      // @ts-expect-error empty name is forbidden
      ESchema.make('', { x: Schema.String }),
    ).toThrow('Schema name must not be empty.');
    expect(() =>
      // @ts-expect-error empty name is forbidden
      ValueESchema.make('', Schema.String),
    ).toThrow('Schema name must not be empty.');
    expect(() =>
      // @ts-expect-error empty name is forbidden
      EntityESchema.make('', 'id', { x: Schema.String }),
    ).toThrow('Schema name must not be empty.');
    expect(() =>
      // @ts-expect-error empty name is forbidden
      SingleEntityESchema.make('', { x: Schema.String }),
    ).toThrow('Schema name must not be empty.');
  });

  it('rejects optional fields introduced by evolve', () => {
    const base = ESchema.make('C1', { x: Schema.String });
    // @ts-expect-error optional delta fields are forbidden
    base.evolve('v2', { y: Schema.optional(Schema.Number) }, (prev) => prev);
    const evolved = base
      .evolve('v2', { y: Schema.NullOr(Schema.Number) }, (prev) => ({
        ...prev,
        y: null,
      }))
      .build();
    expect(evolved.latestVersion).toBe('v2');
  });
});
