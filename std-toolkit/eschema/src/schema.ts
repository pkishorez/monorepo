import { Schema } from 'effect';
import type { DeltaSchema, StructFieldsSchema } from './types.js';

export function struct<S extends StructFieldsSchema>(
  fields: S,
): Schema.Codec<
  Schema.Schema.Type<Schema.Struct<S>>,
  Schema.Codec.Encoded<Schema.Struct<S>>
> {
  return Schema.Struct(fields) as unknown as Schema.Codec<
    Schema.Schema.Type<Schema.Struct<S>>,
    Schema.Codec.Encoded<Schema.Struct<S>>
  >;
}

export const INITIAL_VERSION = 'v1' as const;

export const metaSchema = Schema.Struct({
  _v: Schema.String,
});

export const id = (identifier: string) =>
  Schema.String.annotate({ identifier });

export const fromType = <T>() =>
  Schema.Unknown as unknown as Schema.Codec<T, T>;

export function mergeDelta(
  base: StructFieldsSchema,
  delta: DeltaSchema,
): StructFieldsSchema {
  const merged: StructFieldsSchema = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
