import { Schema } from "effect";

export const metaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
});
export function parseMeta(value: unknown): { _v: string } {
  return decodeSchema(metaSchema.fields, value);
}

export function decodeSchema<S extends Schema.Struct.Fields>(
  schema: S,
  value: unknown,
): Schema.Schema.Type<Schema.Struct<S>> {
  return Schema.decodeUnknownSync(Schema.Struct(schema) as any)(value) as any;
}

export function encodeSchema<S extends Schema.Struct.Fields>(
  schema: S,
  value: Schema.Schema.Type<Schema.Struct<S>>,
): Schema.Schema.Encoded<Schema.Struct<S>> {
  return Schema.encodeSync(Schema.Struct(schema) as any)(value) as any;
}
