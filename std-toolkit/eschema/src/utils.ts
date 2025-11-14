import { StandardSchemaV1 } from '@standard-schema/spec';
import {
  EmptyEvolution,
  LatestEvolution,
  ModifyLastEvolutionSchema,
  ResolveType,
  ResolveWrapper,
  Schema,
  TypeFromSchema,
} from './types.js';

export function resolveValue<
  Args extends any[],
  T extends ResolveWrapper<Args, any>,
>(valueOrFn: T, args: Args): ResolveType<T>;
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
export function resolveValue<T>(valueOrFn: T, args: any[]): ResolveType<T> {
  return (
    typeof valueOrFn === 'function' ? valueOrFn(...args) : valueOrFn
  ) as ResolveType<T>;
}

export function parseStandardSchema(schema: StandardSchemaV1, value: unknown) {
  const result = schema['~standard']['validate'](value);
  if (result instanceof Promise) {
    throw new Error('Async validations are not supported yet.');
  }
  if ('issues' in result) {
    throw new Error(
      result.issues
        ?.map((v) => `${v.path?.join('.')} :: ${v.message}`)
        .join('\n'),
    );
  }
  return result.value;
}

function _parse<S extends Schema>(
  keys: string[],
  schema: S,
  value: unknown,
): TypeFromSchema<S> {
  return Object.fromEntries(
    keys.map((key) => {
      return [key, parseStandardSchema(schema[key], (value as any)[key])];
    }),
  ) as any;
}
export function parse<S extends Schema>(
  schema: S,
  value: unknown,
): TypeFromSchema<S> {
  return _parse(Object.keys(schema), schema, value);
}
export function parsePartial<S extends Schema>(
  schema: S,
  value: unknown,
): TypeFromSchema<S> {
  return _parse(Object.keys(value as any), schema, value);
}

export function extendSchema<
  Evolutions extends EmptyEvolution[],
  S extends Schema,
>(evolutions_: Evolutions, schema: S) {
  const evolutions = [...evolutions_];
  const last = evolutions.pop();

  if (!last) {
    throw new Error('No evolution found.');
  }

  return [
    ...evolutions,
    {
      ...last,
      schema: {
        ...last?.schema,
        ...schema,
      },
    },
  ] as ModifyLastEvolutionSchema<
    Evolutions,
    LatestEvolution<Evolutions>['schema'] & S
  >;
}
