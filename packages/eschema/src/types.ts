import type { Schema } from 'effect';

/**
 * Resolves a type that can be either a function or a value.
 * If it's a function, returns the return type. Otherwise returns the type itself.
 *
 * @template T - The type to resolve (function or value)
 * @example
 * ```typescript
 * type A = ResolveType<() => string>; // string
 * type B = ResolveType<number>; // number
 * type C = ResolveType<(x: any) => boolean>; // boolean
 * ```
 */
export type ResolveType<T> = T extends (...args: any[]) => infer R ? R : T;

/**
 * Metadata attached to schemas in evolutions.
 * Contains version information and can be extended with additional fields in the future.
 *
 * @template V - The version string literal type
 * @example
 * ```typescript
 * type V1Metadata = Metadata<"v1">; // { __v: "v1" }
 * type V2Metadata = Metadata<"v2">; // { __v: "v2" }
 * ```
 */
export interface Metadata<V extends string> {
  __v: V;
}

/**
 * Represents a single schema evolution with a version identifier.
 *
 * @template V - The version string literal type
 * @template S - The Effect Schema type
 */
export interface Evolution<
  V extends string,
  S extends Schema.Schema<any, any, any>,
  Old = never,
> {
  version: V;
  evolution: S;
  migration: (
    v: Old,
    helper: (v: Schema.Schema.Type<S>) => Schema.Schema.Type<S>,
  ) => Schema.Schema.Type<S>;
}

/**
 * Extracts the last element from a readonly tuple type.
 *
 * @example
 * ```typescript
 * type Test = LastElement<[1, 2, 3]>; // 3
 * type Empty = LastElement<[]>; // never
 * ```
 */
export type LastElement<T extends readonly any[]> = T extends readonly [
  ...any[],
  infer Last,
]
  ? Last
  : never;

/**
 * Extracts the schema type from an Evolution.
 *
 * @example
 * ```typescript
 * type MyEvolution = Evolution<"v1", Schema<string>>;
 * type ExtractedSchema = ExtractSchema<MyEvolution>; // Schema<string>
 * ```
 */
export type ExtractSchema<E> = E extends Evolution<any, infer S> ? S : never;

/**
 * Gets the latest schema type from an array of evolutions.
 * This is the main type utility that combines LastElement and ExtractSchema
 * to provide type-safe access to the most recent schema version.
 *
 * @example
 * ```typescript
 * type Evolutions = [
 *   Evolution<"v1", Schema<string>>,
 *   Evolution<"v2", Schema<number>>
 * ];
 * type Latest = LatestSchemaType<Evolutions>; // Schema<number>
 * ```
 */
export type LatestSchemaType<
  Evolutions extends readonly Evolution<any, any>[],
> = ExtractSchema<LastElement<Evolutions>>;

/**
 * Generic utility to extract a specific property as a union from an array of objects.
 * Given an array of objects G<A, ...>[], extracts the union A | A | ...
 *
 * @template T - Array of objects
 * @template K - Key to extract from each object
 * @example
 * ```typescript
 * type Objects = [{ version: "v1", data: string }, { version: "v2", data: number }];
 * type Versions = ExtractUnion<Objects, "version">; // "v1" | "v2"
 * ```
 */
export type ExtractUnion<
  T extends readonly any[],
  K extends keyof T[number],
> = T[number][K];

/**
 * Extracts all version strings as a union type from an array of evolutions.
 *
 * @example
 * ```typescript
 * type Evolutions = [
 *   Evolution<"v1", Schema<string>>,
 *   Evolution<"v2", Schema<number>>
 * ];
 * type Versions = ExtractVersions<Evolutions>; // "v1" | "v2"
 * ```
 */
export type ExtractVersions<T extends readonly Evolution<any, any>[]> =
  ExtractUnion<T, 'version'>;

/**
 * Helper type to ensure a version string is not already used in existing evolutions.
 * Creates a compilation error if the version already exists.
 *
 * @example
 * ```typescript
 * type Evolutions = [Evolution<"v1", Schema<string>>];
 * type Valid = EnsureUniqueVersion<"v2", Evolutions>; // "v2"
 * type Invalid = EnsureUniqueVersion<"v1", Evolutions>; // never (compilation error)
 * ```
 */
export type EnsureUniqueVersion<
  V extends string,
  Evolutions extends readonly Evolution<any, any>[],
> =
  V extends ExtractVersions<Evolutions>
    ? `${V} is already part of previous versions`
    : V;

/**
 * Transforms an array of evolutions into a version-to-schema mapping object.
 *
 * @example
 * ```typescript
 * type Evolutions = [
 *   Evolution<"v1", Schema<string>>,
 *   Evolution<"v2", Schema<number>>
 * ];
 * type Mapped = EvolutionsToObject<Evolutions>; // { v1: Schema<string>, v2: Schema<number> }
 * ```
 */
export type EvolutionsToObject<T extends readonly Evolution<any, any>[]> = {
  [K in T[number] as K extends Evolution<infer V, any>
    ? V
    : never]: K extends Evolution<any, infer S> ? S : never;
};
