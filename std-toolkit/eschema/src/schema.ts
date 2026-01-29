import { Schema } from "effect";
import type { StructFieldsSchema } from "./types";

export function struct<S extends StructFieldsSchema>(
  fields: S,
): Schema.Schema<
  Schema.Schema.Type<Schema.Struct<S>>,
  Schema.Schema.Encoded<Schema.Struct<S>>,
  never
> {
  return Schema.Struct(fields) as unknown as Schema.Schema<
    Schema.Schema.Type<Schema.Struct<S>>,
    Schema.Schema.Encoded<Schema.Struct<S>>,
    never
  >;
}

export const metaSchema = Schema.Struct({
  _v: Schema.String,
});
