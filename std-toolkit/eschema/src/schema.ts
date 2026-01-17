import { Effect, Schema } from "effect";
import { ESchemaError } from "./utils";

export const metaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
});

export function parseMeta(value: unknown): Effect.Effect<{ _v: string }, ESchemaError> {
  return decodeStruct(metaSchema.fields, value);
}

export function decodeStruct<S extends Schema.Struct.Fields>(
  fields: S,
  value: unknown,
): Effect.Effect<Schema.Schema.Type<Schema.Struct<S>>, ESchemaError> {
  return Schema.decodeUnknown(Schema.Struct(fields) as any)(value).pipe(
    Effect.mapError((error) => new ESchemaError({ message: "Decode failed", cause: error })),
  ) as any;
}

export function encodeStruct<S extends Schema.Struct.Fields>(
  fields: S,
  value: Schema.Schema.Type<Schema.Struct<S>>,
): Effect.Effect<Schema.Schema.Encoded<Schema.Struct<S>>, ESchemaError> {
  return Schema.encode(Schema.Struct(fields) as any)(value).pipe(
    Effect.mapError((error) => new ESchemaError({ message: "Encode failed", cause: error })),
  ) as any;
}
