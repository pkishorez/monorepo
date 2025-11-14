import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Simplify } from 'type-fest';

export type ResolveWrapper<Args extends any[], T> = T | ((...args: Args) => T);
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
export type ResolveType<T extends ResolveWrapper<any[], any>> =
  T extends ResolveWrapper<any[], infer T> ? T : never;

export type ExcludeKeys<T, K extends string, Msg extends string = ''> = T & {
  [P in K]?: `key '${P}' is not allowed. ${Msg}`;
};

export type Schema = Record<string, StandardSchemaV1>;
export type TypeFromSchema<S extends Schema> = Simplify<{
  [K in keyof S]: StandardSchemaV1.InferOutput<S[K]>;
}>;

export type TypeFromEvolution<
  E extends EmptyEvolution,
  IncludeVersion extends boolean = true,
> =
  E extends Evolution<infer V, infer S>
    ? TypeFromSchema<S> & (IncludeVersion extends true ? Record<'_v', V> : {})
    : never;
export type Evolution<Version extends string, S extends Schema, Old = any> = {
  migrate: null | ((oldValue: Old) => TypeFromSchema<S>);
  version: Version;
  schema: S;
};
export type EmptyEvolution = Evolution<string, Schema>;

export type EvolutionFromVersion<
  EvolutionArr extends EmptyEvolution[],
  Version extends string,
> = EvolutionArr extends [
  infer F extends EmptyEvolution,
  ...infer Rest extends EmptyEvolution[],
]
  ? F['version'] extends Version
    ? F
    : EvolutionFromVersion<Rest, Version>
  : never;
export type LatestEvolution<EvolutionArr extends EmptyEvolution[]> =
  EvolutionArr extends [infer Last]
    ? Last
    : EvolutionArr extends [any, ...infer R extends EmptyEvolution[]]
      ? LatestEvolution<R>
      : never;
export type ModifyLastEvolutionSchema<
  EvolutionArr extends EmptyEvolution[],
  S extends Schema,
> = EvolutionArr extends [infer Last extends EmptyEvolution]
  ? [Evolution<Last['version'], S, any>]
  : EvolutionArr extends [
        infer First extends EmptyEvolution,
        ...infer Rest extends EmptyEvolution[],
      ]
    ? [First, ...ModifyLastEvolutionSchema<Rest, S>]
    : never;

export type EvolutionSchemaMap<
  EvolutionArr extends EmptyEvolution[],
  Result = {},
> = EvolutionArr extends [infer Elem extends EmptyEvolution]
  ? Result & Record<Elem['version'], Elem['schema']>
  : EvolutionArr extends [
        infer Elem extends EmptyEvolution,
        ...infer R extends EmptyEvolution[],
      ]
    ? EvolutionSchemaMap<R, Result & Record<Elem['version'], Elem['schema']>>
    : never;
