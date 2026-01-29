// Standard Schema helper types
import type { ESchema } from "./eschema";
import { JSONSchema, Schema } from "effect";

export type ESchemaDescriptor = JSONSchema.JsonSchema7Object & {
  $schema?: string;
  $defs?: Record<string, JSONSchema.JsonSchema7>;
};

export type StructFieldsSchema<Or = never> = Record<
  string,
  | Schema.Schema<any, any, never>
  | Schema.PropertySignature<any, any, any, any, any, any, never>
  | Or
>;

// Delta schema allows null for field removal
export type DeltaSchema = Record<
  string,
  | Schema.Schema<any, any, never>
  | Schema.PropertySignature<any, any, any, any, any, any, never>
  | null
>;

// Merge schemas: Base minus Delta keys, plus non-null Delta keys
export type MergeSchemas<
  Base extends StructFieldsSchema,
  Delta extends DeltaSchema,
> = Prettify<
  Omit<Base, keyof Delta> & {
    [K in keyof Delta as Delta[K] extends null ? never : K]: Delta[K];
  }
>;

export type StructFieldsDecoded<T extends StructFieldsSchema> =
  Schema.Schema.Type<Schema.Struct<T>>;

export type StructFieldsEncoded<T extends StructFieldsSchema> =
  Schema.Schema.Encoded<Schema.Struct<T>>;

export type ForbidUnderscorePrefix<T> = {
  [K in keyof T]: K extends `_${string}`
    ? "Key with prefix _ is Forbidden."
    : T[K];
};

/**
 * Type-level enforcement that the schema must not contain the ID field.
 * The ID field is automatically added by ESchema and is reserved.
 */
export type ForbidIdField<T, IdField extends string> = {
  [K in keyof T]: K extends IdField
    ? `Field "${IdField}" is reserved as the ID field and cannot be in the schema.`
    : T[K];
};

// Type helpers
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// 1. Create a helper to generate a tuple of a specific length
type BuildTuple<L extends number, T extends any[] = []> = T["length"] extends L
  ? T
  : BuildTuple<L, [...T, any]>;

// 2. The core logic: Extract, Increment, and Reassemble
export type NextVersion<V extends string> =
  V extends `v${infer Num extends number}`
    ? `v${[...BuildTuple<Num>, any]["length"] & number}`
    : never;

export type AnyESchema<
  N extends string = string,
  Id extends string = string,
  V extends string = string,
  S extends StructFieldsSchema = any,
> = ESchema<N, Id, V, S>;

/**
 * Extracts the type from an ESchema.
 * Same type for both encode and decode operations.
 */
export type ESchemaType<T extends AnyESchema> =
  T extends ESchema<infer _N, infer _Id, infer _V, infer TLatest>
    ? Prettify<StructFieldsDecoded<TLatest>>
    : never;

/**
 * Extracts the ID field name from an ESchema.
 */
export type ESchemaIdField<T extends AnyESchema> =
  T extends ESchema<infer _N, infer Id, infer _V, infer _TLatest>
    ? Id
    : never;

/**
 * Simple string ID schema type.
 * Used for entity ID fields without branding.
 */
export type IdSchema = Schema.Schema<string, string, never>;
