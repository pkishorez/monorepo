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

/**
 * An unpublished, dev-time-only overlay on top of the last published
 * evolution. `forward` produces the draft's decoded read shape from the last
 * published decoded shape; `backward` produces the last published decoded
 * shape from the draft's decoded shape, so encode always writes bytes in the
 * last published shape.
 */
export type DraftDefinition = {
  readonly schema: StructFieldsSchema;
  readonly forward: (previous: any) => any;
  readonly backward: (draft: any) => any;
};

export type ValueDraftDefinition = {
  readonly schema: ValueSchema;
  readonly forward: (previous: any) => any;
  readonly backward: (draft: any) => any;
};

// ─── Any* type aliases ──────────────────────────────────────────────────────

/**
 * Widest type — matches any ESchema (base, SingleEntity, or Entity), drafted
 * or not. `TDraft` defaults to `S` (the last published shape), which is
 * exactly what an undrafted ESchema already is — decode/encode operate on
 * the same shape everything else does. A drafted schema is simply an
 * instance where `TDraft` differs from `S`: `Type`/decode/encode follow
 * `TDraft`, while `Encoded` — and everything a Snapshot ever sees — stays
 * pinned to `S`. One family, one default, instead of a parallel hierarchy.
 */
export interface AnyESchema<
  V extends string = string,
  S extends StructFieldsSchema = any,
  N extends string = string,
  TDraft extends StructFieldsSchema = S,
> {
  readonly name: N;
  readonly latestVersion: V;
  readonly fields: S;
  readonly schema: Schema.Struct<S>;
  readonly Type: Prettify<StructFieldsDecoded<TDraft>>;
  readonly Encoded: Prettify<StructFieldsEncoded<S>> & {
    readonly _v: V;
  };
  makePartial(
    value: Partial<StructFieldsDecoded<S>>,
  ): Partial<StructFieldsDecoded<S>> & { readonly _v: V };
  decode(
    value: unknown,
  ): Effect.Effect<Prettify<StructFieldsDecoded<TDraft>>, ESchemaError>;
  encode(
    value: StructFieldsDecoded<TDraft>,
  ): Effect.Effect<
    Prettify<StructFieldsEncoded<S>> & { readonly _v: V },
    ESchemaError
  >;
  getDescriptor(): ESchemaDescriptor;
  readonly '~standard': StandardSchemaV1.Props<
    unknown,
    Prettify<StructFieldsDecoded<TDraft>>
  >;
}

/**
 * Matches an ESchema without an entity ID field.
 */
export type AnyUnkeyedESchema<
  V extends string = string,
  S extends StructFieldsSchema = any,
  N extends string = string,
  TDraft extends StructFieldsSchema = S,
> = AnyESchema<V, S, N, TDraft> & { readonly idField?: never };

/**
 * Matches any EntityESchema (has name + idField), drafted or not.
 */
export interface AnyEntityESchema<
  N extends string = string,
  Id extends string = string,
  V extends string = string,
  S extends StructFieldsSchema = any,
  TDraft extends StructFieldsSchema = S,
> extends AnyESchema<V, S, N, TDraft> {
  readonly idField: Id;
}

/**
 * Matches any ValueESchema, drafted or not — same `TDraft`-defaults-to-`S`
 * shape as {@link AnyESchema}.
 */
export interface AnyValueESchema<
  V extends string = string,
  S extends ValueSchema = any,
  TDraft extends ValueSchema = S,
> {
  readonly name: string;
  readonly latestVersion: V;
  readonly schema: S;
  readonly Type: ValueSchemaDecoded<TDraft>;
  readonly Encoded: ValueEnvelopeEncoded<V, S>;
  decode(
    value: unknown,
  ): Effect.Effect<ValueSchemaDecoded<TDraft>, ESchemaError>;
  encode(
    value: ValueSchemaDecoded<TDraft>,
  ): Effect.Effect<ValueEnvelopeEncoded<V, S>, ESchemaError>;
  getDescriptor(): ESchemaDescriptor;
  readonly '~standard': StandardSchemaV1.Props<
    unknown,
    ValueSchemaDecoded<TDraft>
  >;
}

export type AnyEvolvingSchema = AnyESchema | AnyEntityESchema | AnyValueESchema;

// ─── Type extractors ────────────────────────────────────────────────────────

/**
 * Extracts the type from any ESchema level — the draft's shape when one
 * exists, the last published shape otherwise. Same type for both encode and
 * decode operations.
 */
export type ESchemaType<T extends AnyEvolvingSchema> =
  T extends AnyValueESchema<infer _V, infer _S, infer TDraft>
    ? ValueSchemaDecoded<TDraft>
    : T extends AnyESchema<infer _V, infer _S, infer _N, infer TDraft>
      ? Prettify<StructFieldsDecoded<TDraft>>
      : never;

export type ESchemaEncoded<T extends AnyEvolvingSchema> =
  T extends AnyValueESchema<infer V, infer S, infer _TDraft>
    ? ValueEnvelopeEncoded<V, S>
    : T extends AnyESchema<infer V, infer S, infer _N, infer _TDraft>
      ? Prettify<StructFieldsEncoded<S> & { readonly _v: V }>
      : never;

/**
 * Extracts the ID field name from an EntityESchema.
 */
export type ESchemaIdField<T extends AnyEntityESchema> =
  T extends AnyEntityESchema<infer _N, infer Id, infer _V, infer _S>
    ? Id
    : never;

/**
 * Extracts the name from any named evolving schema.
 */
export type ESchemaName<T extends { readonly name: string }> = T['name'];
