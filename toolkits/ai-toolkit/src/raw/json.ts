import { Schema } from 'effect';

/** Any JSON value; `Schema.Json` is a declared type with no stored form. */
export type Json =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<Json>
  | { readonly [key: string]: Json };

export const JsonSchema: Schema.Codec<Json> = Schema.Union([
  Schema.Null,
  Schema.Boolean,
  Schema.Finite,
  Schema.String,
  Schema.Array(Schema.suspend((): Schema.Codec<Json> => JsonSchema)),
  Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<Json> => JsonSchema),
  ),
]);
