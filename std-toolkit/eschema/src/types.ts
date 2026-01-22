// Standard Schema helper types
import type { ESchema } from "./eschema";
import { Schema } from "effect";

export type StructFieldsSchema = Record<
  string,
  | Schema.Schema<any, any, never>
  | Schema.PropertySignature<any, any, any, any, any, any, never>
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
  V extends string = string,
  S extends StructFieldsSchema = StructFieldsSchema,
> = ESchema<N, V, S>;

export type ESchemaEncoded<T extends AnyESchema> =
  T extends ESchema<infer _N, infer V, infer TLatest>
    ? Prettify<Schema.Schema.Encoded<Schema.Struct<TLatest>> & { _v: V }>
    : never;
export type ESchemaType<T extends AnyESchema> =
  T extends ESchema<infer _N, infer V, infer TLatest>
    ? Prettify<StructFieldsDecoded<TLatest> & { _v: V }>
    : never;
