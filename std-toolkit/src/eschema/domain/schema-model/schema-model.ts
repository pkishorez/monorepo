import { Effect, JsonSchema, Schema } from 'effect';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ESchemaError } from '../eschema-error/index.js';

export type ESchemaDescriptor = JsonSchema.JsonSchema & {
  type?: string;
  properties: Record<string, JsonSchema.JsonSchema>;
  $schema?: string;
  $defs?: Record<string, JsonSchema.JsonSchema>;
};

export type StructFieldsSchema<Or = never> = Record<string, Schema.Top | Or>;

export type DeltaSchema = Record<string, Schema.Top | null>;

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
  Schema.Codec.Encoded<Schema.Struct<T>>;

export type ValueSchema = Schema.Codec<any, any>;

export type ValueSchemaDecoded<T extends ValueSchema> = Schema.Schema.Type<T>;

export type ValueSchemaEncoded<T extends ValueSchema> = Schema.Codec.Encoded<T>;

export type ValueEnvelopeEncoded<
  TVersion extends string,
  TSchema extends ValueSchema,
> = {
  readonly _v: TVersion;
  readonly value: ValueSchemaEncoded<TSchema>;
};

/**
 * Type-level enforcement that a schema name is a non-empty string.
 */
export type ForbidEmptyName<N extends string> = N extends ''
  ? { 'Schema name must not be empty.': never }
  : unknown;

/**
 * Type-level enforcement that fields are never optional and never admit
 * `undefined`. Absence must be modeled as `null` via `Schema.NullOr`.
 */
export type ForbidOptionalFields<T> = {
  [K in keyof T]: T[K] extends { readonly '~type.optionality': 'optional' }
    ? 'Optional fields are forbidden. Model absence with Schema.NullOr(...).'
    : T[K] extends { readonly Type: infer A }
      ? undefined extends A
        ? '`undefined` is forbidden in field types. Model absence with Schema.NullOr(...).'
        : T[K]
      : T[K];
};

/**
 * Type-level enforcement that a value schema never admits `undefined`.
 */
export type ForbidUndefinedValue<S extends ValueSchema> = S extends {
  readonly '~type.optionality': 'optional';
}
  ? {
      'Optional schemas are forbidden. Model absence with Schema.NullOr(...).': never;
    }
  : undefined extends ValueSchemaDecoded<S>
    ? {
        '`undefined` is forbidden in a ValueESchema. Model absence with Schema.NullOr(...).': never;
      }
    : unknown;

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

export type Evolution = {
  version: string;
  schema: StructFieldsSchema;
  migration: ((prev: any) => any) | null;
};

export type ValueEvolution = {
  version: string;
  schema: ValueSchema;
  migration: ((prev: any) => any) | null;
};

// ─── Any* type aliases ──────────────────────────────────────────────────────

/**
 * Widest type — matches any ESchema (base, SingleEntity, or Entity).
 */
export interface AnyESchema<
  V extends string = string,
  S extends StructFieldsSchema = any,
  N extends string = string,
> {
  readonly name: N;
  readonly latestVersion: V;
  readonly fields: S;
  readonly schema: Schema.Struct<S>;
  readonly Type: Prettify<StructFieldsDecoded<S>>;
  readonly Encoded: Prettify<StructFieldsEncoded<S>> & {
    readonly _v: V;
  };
  makePartial(
    value: Partial<StructFieldsDecoded<S>>,
  ): Partial<StructFieldsDecoded<S>> & { readonly _v: V };
  decode(
    value: unknown,
  ): Effect.Effect<Prettify<StructFieldsDecoded<S>>, ESchemaError>;
  encode(
    value: StructFieldsDecoded<S>,
  ): Effect.Effect<
    Prettify<StructFieldsEncoded<S>> & { readonly _v: V },
    ESchemaError
  >;
  getDescriptor(): ESchemaDescriptor;
  readonly '~standard': StandardSchemaV1.Props<
    unknown,
    Prettify<StructFieldsDecoded<S>>
  >;
}

/**
 * Matches an ESchema without an entity ID field.
 */
export type AnyUnkeyedESchema<
  V extends string = string,
  S extends StructFieldsSchema = any,
  N extends string = string,
> = AnyESchema<V, S, N> & { readonly idField?: never };

/**
 * Matches any EntityESchema (has name + idField).
 */
export interface AnyEntityESchema<
  N extends string = string,
  Id extends string = string,
  V extends string = string,
  S extends StructFieldsSchema = any,
> extends AnyESchema<V, S, N> {
  readonly idField: Id;
}

export interface AnyValueESchema<
  V extends string = string,
  S extends ValueSchema = any,
> {
  readonly name: string;
  readonly latestVersion: V;
  readonly schema: S;
  readonly Type: ValueSchemaDecoded<S>;
  readonly Encoded: ValueEnvelopeEncoded<V, S>;
  decode(value: unknown): Effect.Effect<ValueSchemaDecoded<S>, ESchemaError>;
  encode(
    value: ValueSchemaDecoded<S>,
  ): Effect.Effect<ValueEnvelopeEncoded<V, S>, ESchemaError>;
  getDescriptor(): ESchemaDescriptor;
  readonly '~standard': StandardSchemaV1.Props<unknown, ValueSchemaDecoded<S>>;
}

export type AnyEvolvingSchema = AnyESchema | AnyEntityESchema | AnyValueESchema;

// ─── Type extractors ────────────────────────────────────────────────────────

/**
 * Extracts the type from any ESchema level.
 * Same type for both encode and decode operations.
 */
export type ESchemaType<T extends AnyEvolvingSchema> =
  T extends AnyValueESchema<infer _V, infer TLatest>
    ? ValueSchemaDecoded<TLatest>
    : T extends AnyESchema<infer _V, infer TLatest, infer _N>
      ? Prettify<StructFieldsDecoded<TLatest>>
      : never;

export type ESchemaEncoded<T extends AnyEvolvingSchema> =
  T extends AnyValueESchema<infer V, infer TLatest>
    ? ValueEnvelopeEncoded<V, TLatest>
    : T extends AnyESchema<infer V, infer TLatest, infer _N>
      ? Prettify<StructFieldsEncoded<TLatest> & { readonly _v: V }>
      : never;

/**
 * Extracts the ID field name from an EntityESchema.
 */
export type ESchemaIdField<T extends AnyEntityESchema> =
  T extends AnyEntityESchema<infer _N, infer Id, infer _V, infer _TLatest>
    ? Id
    : never;

/**
 * Extracts the name from any named evolving schema.
 */
export type ESchemaName<T extends { readonly name: string }> = T['name'];
