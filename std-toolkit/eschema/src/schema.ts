import { Schema } from "effect";

export const metaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
});
export function parseMeta(value: unknown): { _v: string } {
  return decodeStruct(metaSchema.fields, value);
}

export function decodeStruct<S extends Schema.Struct.Fields>(
  fields: S,
  value: unknown,
): Schema.Schema.Type<Schema.Struct<S>> {
  return Schema.decodeUnknownSync(Schema.Struct(fields) as any)(value) as any;
}

export function encodeStruct<S extends Schema.Struct.Fields>(
  fields: S,
  value: Schema.Schema.Type<Schema.Struct<S>>,
): Schema.Schema.Encoded<Schema.Struct<S>> {
  return Schema.encodeSync(Schema.Struct(fields) as any)(value) as any;
}
