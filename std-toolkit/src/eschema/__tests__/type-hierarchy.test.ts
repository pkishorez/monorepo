import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import {
  ESchema,
  EntityESchema,
  ValueESchema,
  type AnyESchema,
  type AnyEntityESchema,
  type AnyUnkeyedESchema,
  type ESchemaType,
  type StructFieldsSchema,
  type ValueSchema,
} from '../index.js';

function acceptsConcreteESchema<
  V extends string,
  S extends StructFieldsSchema,
  N extends string,
>(schema: ESchema<V, S, N>) {
  return schema;
}

function acceptsConcreteEntityESchema<
  N extends string,
  Id extends string,
  V extends string,
  S extends StructFieldsSchema,
>(schema: EntityESchema<N, Id, V, S>) {
  return schema;
}

function acceptsConcreteValueESchema<V extends string, S extends ValueSchema>(
  schema: ValueESchema<V, S>,
) {
  return schema;
}

function acceptsAnyESchema(schema: AnyESchema) {
  return schema.getDescriptor();
}

function acceptsUnkeyedESchema(schema: AnyUnkeyedESchema) {
  return schema.name;
}

function acceptsEntity(schema: AnyEntityESchema) {
  return schema.idField;
}

const base = ESchema.make('Base', { a: Schema.String }).build();
const entity = EntityESchema.make('User', 'id', {
  a: Schema.String,
}).build();
const value = ValueESchema.make('Count', Schema.Number).build();

describe('ESchema', () => {
  describe('Types', () => {
    describe('type hierarchy — assignability', () => {
      it('accepts ESchema as AnyESchema', () => {
        expect(acceptsAnyESchema(base).type).toBe('object');
      });

      it('accepts EntityESchema as AnyESchema', () => {
        expect(acceptsAnyESchema(entity).type).toBe('object');
        expect(entity).not.toBeInstanceOf(ESchema);
      });

      it('preserves concrete schema classes through builders', () => {
        expect(acceptsConcreteESchema(base)).toBe(base);
        expect(acceptsConcreteEntityESchema(entity)).toBe(entity);
        expect(acceptsConcreteValueESchema(value)).toBe(value);
      });

      it('accepts ESchema as AnyUnkeyedESchema', () => {
        expect(acceptsUnkeyedESchema(base)).toBe('Base');
      });

      it('preserves the ESchema name as a literal type', () => {
        const name: 'Base' = base.name;
        expect(name).toBe('Base');
      });

      it('does not accept EntityESchema as AnyUnkeyedESchema', () => {
        // @ts-expect-error — keyed entities cannot use singleton storage
        acceptsUnkeyedESchema(entity);
      });

      it('does not accept ESchema as AnyEntityESchema', () => {
        // @ts-expect-error — ESchema has no idField
        acceptsEntity(base);
      });
    });

    describe('Type extraction', () => {
      it('extracts type from ESchema', () => {
        type T = ESchemaType<typeof base>;
        const value: T = { a: 'hello' };
        expect(value).toEqual({ a: 'hello' });
      });

      it('extracts type from EntityESchema', () => {
        type T = ESchemaType<typeof entity>;
        const value: T = { id: 'u1', a: 'hello' };
        expect(value).toEqual({ id: 'u1', a: 'hello' });
      });
    });
  });
});
