import { StandardSchemaV1 } from "@standard-schema/spec";

export type InputSchema<T extends Record<string, unknown>> = StandardSchemaV1<
  unknown,
  T
>;
export type AnyInputSchema = InputSchema<Record<string, any>>;

export type InputSchemaType<S extends AnyInputSchema> =
  S extends InputSchema<infer T> ? T : never;

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
