import * as Schema from 'effect/Schema';
import { Schema as ESchema, TypeFromSchema } from './types.js';
import { parseStandardSchema } from './utils.js';

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
