import * as Schema from 'effect/Schema';
import { Schema as ESchema, TypeFromSchema } from './types.js';
import { parseStandardSchema } from './utils.js';
import { StandardSchemaV1 } from '@standard-schema/spec';

export const fromEffectStruct = <S extends Schema.Struct<any>>(
  struct: S,
): {
  [Key in keyof S['fields']]: StandardSchemaV1<
    Schema.Schema.Type<S['fields'][Key]>
  >;
} => {
  return Object.fromEntries(
    Object.keys(struct.fields).map((key) => [
      key,
      Schema.standardSchemaV1(struct.fields[key]),
    ]),
  ) as any;
};

export const toEffectSchema = <S extends ESchema>(
  schema: S,
): Schema.Schema<TypeFromSchema<S>> => {
  return Schema.Struct(
    Object.fromEntries(
      Object.keys(schema).map((key) => [
        key,
        Schema.transform(Schema.Any, Schema.Any, {
          decode: (value) => parseStandardSchema(schema[key], value),
          encode: (value) => parseStandardSchema(schema[key], value),
        }) as any,
      ]),
    ),
  ) as any;
};

export const toEffectBroadcastSchema = <S extends Schema.Schema.Any>(
  schema: S,
) => {
  return Schema.Struct({
    _tag: Schema.Literal('std-toolkit/broadcast'),
    value: schema,
    meta: Schema.Struct({
      _u: Schema.String,
      _v: Schema.String,
      _d: Schema.Boolean,
      _e: Schema.String,
      _i: Schema.Number,
    }),
  });
};

export const fromEffectSchema = <S extends Record<string, Schema.Schema<any>>>(
  schema: S,
): {
  [K in keyof S]: StandardSchemaV1<Schema.Schema.Type<S[K]>>;
} => {
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      Schema.standardSchemaV1(value),
    ]),
  ) as any;
};
