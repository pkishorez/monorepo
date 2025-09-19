import type {
  Evolution,
  EvolutionsToObject,
  ExtractVersions,
  Metadata,
  ResolveType,
} from './types.js';
import { Effect, Schema } from 'effect';
import { ESchemaParseError } from './errors.js';

// Overload for direct values (no parameters)
export function resolveValue<T>(valueOrFn: T): ResolveType<T>;
// Overload for functions with parameters
export function resolveValue<TFn extends (...args: any[]) => any>(
  valueOrFn: TFn,
  ...args: Parameters<TFn>
): ReturnType<TFn>;
// Implementation
/**
 * Resolves a value that can be either a function or a direct value.
 * If it's a function, calls it with the provided arguments and returns the result.
 * Otherwise returns the value itself.
 *
 * @template T - The type to resolve (function or value)
 * @param valueOrFn - The value or function to resolve
 * @param args - Arguments to pass to the function if valueOrFn is a function
 * @returns The resolved value
 * @example
 * ```typescript
 * const directValue = resolveValue(42); // 42
 * const functionValue = resolveValue(() => 42); // 42
 * const parameterized = resolveValue((x: number) => x * 2, 5); // 10
 * const schema = resolveValue((schemas) => S.string, schemasObj); // resolved schema
 * ```
 */
export function resolveValue<T>(valueOrFn: T, ...args: any[]): ResolveType<T> {
  return (
    typeof valueOrFn === 'function' && !('ast' in valueOrFn)
      ? valueOrFn(...args)
      : valueOrFn
  ) as ResolveType<T>;
}

/**
 * Transforms an array of evolutions into a version-to-schema mapping object.
 *
 * @template T - The evolution array type
 * @param evolutions - Array of evolution objects
 * @returns Object mapping version strings to their corresponding schemas
 * @example
 * ```typescript
 * const evolutions = [
 *   { version: 'v1', evolution: stringSchema, migration: identity },
 *   { version: 'v2', evolution: numberSchema, migration: identity }
 * ];
 * const mapped = evolutionsToObject(evolutions); // { v1: stringSchema, v2: numberSchema }
 * ```
 */
export function evolutionsToObject<T extends readonly Evolution<any, any>[]>(
  evolutions: T,
): EvolutionsToObject<T> {
  return evolutions.reduce((acc, evolution) => {
    acc[evolution.version] = evolution.schema;
    return acc;
  }, {} as any) as EvolutionsToObject<T>;
}

/**
 * Enhances an evolution by adding version metadata to its schema.
 * Creates a new schema that extends the original with metadata fields (currently `__v` version field).
 *
 * @template V - The version string literal type
 * @template S - The Effect Schema type
 * @param evo - The evolution to enhance with metadata
 * @returns A new evolution with the enhanced schema that includes version metadata
 * @example
 * ```typescript
 * const originalEvolution = {
 *   version: 'v1',
 *   evolution: S.Struct({ name: S.String }),
 *   migration: identity
 * };
 *
 * const withMetadata = evolution(originalEvolution);
 * // The resulting schema will have: { name: string, __v: "v1" }
 * ```
 */
export function evolution<
  V extends string,
  S extends Schema.Schema<any, any, any>,
  Old = never,
>(
  evo: Evolution<V, S, Old>,
): Evolution<
  V,
  Schema.Schema<
    Schema.Schema.Type<S> & Metadata<V>,
    Schema.Schema.Encoded<S> & Metadata<V>,
    Schema.Schema.Context<S>
  >,
  Old
> {
  const enhancedSchema = Schema.extend(
    evo.schema,
    Schema.Struct({
      __v: Schema.Literal(evo.version),
    }),
  );

  return {
    version: evo.version,
    schema: enhancedSchema,
    migration: evo.migration,
  };
}

/**
 * Extracts version from unknown data using schema validation.
 * Uses a metadata-compatible schema to parse and validate the version field.
 *
 * @template Evolutions - The array of available evolutions
 * @param data - Unknown data to extract version from
 * @param evolutions - Array of available evolutions to validate against
 * @returns The extracted and validated version string
 * @throws Error when version cannot be extracted or is invalid
 *
 * @example
 * ```typescript
 * const evolutions = [
 *   { version: 'v1', evolution: schema1, migration: fn1 },
 *   { version: 'v2', evolution: schema2, migration: fn2 }
 * ];
 *
 * const version = extractVersion({ name: 'John', __v: 'v1' }, evolutions);
 * // Returns 'v1'
 * ```
 */
export function extractVersion<
  Evolutions extends readonly Evolution<any, any>[],
>(data: unknown, evolutions: Evolutions) {
  return Effect.gen(function* () {
    // Create a schema that matches the metadata structure
    const versionSchema = Schema.Struct({
      __v: Schema.String,
    });

    const versionData = yield* Schema.decodeUnknown(versionSchema)(data).pipe(
      Effect.mapError(
        (err) =>
          new ESchemaParseError({
            msg: `Failed to extract version from data: ${err}`,
          }),
      ),
    );

    const version = versionData.__v;

    // Check if version exists in our evolutions
    const validVersions = evolutions.map((e) => e.version);
    if (!validVersions.includes(version)) {
      return yield* Effect.fail(
        new ESchemaParseError({
          msg: `Unknown version "${version}". Available versions: ${validVersions.join(', ')}`,
        }),
      );
    }

    return version as ExtractVersions<Evolutions>;
  });
}
