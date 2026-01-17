import { Schema } from "effect";

export type StructFieldsSchema = Record<string, Schema.Struct.Field>;

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

// Standard Schema helper types
import type { ESchema } from "./eschema";

export type AnyESchema = ESchema<string, string, any>;

export type ESchemaType<T extends AnyESchema> =
  T extends ESchema<infer _N, infer _V, infer TLatest>
    ? StructFieldsDecoded<TLatest>
    : never;

export type ESchemaInput<T> = T extends ESchema<any, any, any> ? unknown : never;

export type ESchemaOutput<T> =
  T extends ESchema<infer TName, infer TVersion, infer TLatest>
    ? Prettify<StructFieldsDecoded<TLatest> & { _v: TVersion; _e: TName }>
    : never;
