import type { ESchema, SingleEntityESchema, EntityESchema } from './eschema.js';
import { JSONSchema, Schema } from 'effect';

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

export type DeltaSchema = Record<
  string,
  | Schema.Schema<any, any, never>
  | Schema.PropertySignature<any, any, any, any, any, any, never>
  | null
>;

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
    ? 'Key with prefix _ is Forbidden.'
    : T[K];
};

/**
 * Type-level enforcement that the schema must not contain the ID field.
 * The ID field is automatically added by EntityESchema and is reserved.
 */
export type ForbidIdField<T, IdField extends string> = {
  [K in keyof T]: K extends IdField
    ? `Field "${IdField}" is reserved as the ID field and cannot be in the schema.`
    : T[K];
};

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type BuildTuple<L extends number, T extends any[] = []> = T['length'] extends L
  ? T
  : BuildTuple<L, [...T, any]>;

export type NextVersion<V extends string> =
  V extends `v${infer Num extends number}`
    ? `v${[...BuildTuple<Num>, any]['length'] & number}`
    : never;

/**
 * Simple string ID schema type.
 * Used for entity ID fields without branding.
 */
export type IdSchema = Schema.Schema<string, string, never>;

export type Evolution = {
  version: string;
  schema: StructFieldsSchema;
  migration: ((prev: any) => any) | null;
};

// ─── Any* type aliases ──────────────────────────────────────────────────────

/**
 * Widest type — matches any ESchema (base, SingleEntity, or Entity).
 */
export type AnyESchema<
  V extends string = string,
  S extends StructFieldsSchema = any,
> = ESchema<V, S>;

/**
 * Matches any SingleEntityESchema or EntityESchema (has name).
 */
export type AnySingleEntityESchema<
  N extends string = string,
  V extends string = string,
  S extends StructFieldsSchema = any,
> = SingleEntityESchema<N, V, S>;

/**
 * Matches any EntityESchema (has name + idField).
 */
export type AnyEntityESchema<
  N extends string = string,
  Id extends string = string,
  V extends string = string,
  S extends StructFieldsSchema = any,
> = EntityESchema<N, Id, V, S>;

// ─── Type extractors ────────────────────────────────────────────────────────

/**
 * Extracts the type from any ESchema level.
 * Same type for both encode and decode operations.
 */
export type ESchemaType<T extends AnyESchema> =
  T extends ESchema<infer _V, infer TLatest>
    ? Prettify<StructFieldsDecoded<TLatest>>
    : never;

export type ESchemaEncoded<T extends AnyESchema> =
  T extends ESchema<infer V, infer TLatest>
    ? Prettify<StructFieldsEncoded<TLatest> & { readonly _v: V }>
    : never;

/**
 * Extracts the ID field name from an EntityESchema.
 */
export type ESchemaIdField<T extends AnyEntityESchema> =
  T extends EntityESchema<infer _N, infer Id, infer _V, infer _TLatest>
    ? Id
    : never;

/**
 * Extracts the name from a SingleEntityESchema or EntityESchema.
 */
export type ESchemaName<T extends AnySingleEntityESchema> =
  T extends SingleEntityESchema<infer N, infer _V, infer _TLatest> ? N : never;
