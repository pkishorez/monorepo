import {
  EmptyEvolution,
  EvolutionSchemaMap,
  ExcludeKeys,
  LatestEvolution,
  ResolveType,
  ResolveWrapper,
  Schema,
  TypeFromEvolution,
  TypeFromSchema,
} from './types.js';
import * as v from 'valibot';
import { resolveValue, parse, parsePartial, extendSchema } from './utils.js';

const versionSchema = v.object({ _v: v.string() });
export type EmptyESchema = ESchema<EmptyEvolution[]>;
export type EmptyESchemaWithName = ESchemaWithName<string, EmptyEvolution[]>;
export class ESchema<TEvolutions extends EmptyEvolution[]> {
  static make<S extends Schema>(schema: S) {
    return new Builder([{ version: 'v1', schema, migrate: null }]) as Builder<
      [{ version: 'v1'; schema: S; migrate: null }]
    >;
  }

  #evolutions: TEvolutions;
  constructor(evolutions: TEvolutions) {
    this.#evolutions = evolutions;
  }

  get latest(): LatestEvolution<TEvolutions> extends never
    ? EmptyEvolution
    : LatestEvolution<TEvolutions> {
    return this.#evolutions[this.#evolutions.length - 1] as any;
  }
  get schema(): LatestEvolution<TEvolutions>['schema'] {
    return this.#evolutions[this.#evolutions.length - 1].schema;
  }

  get Type(): TypeFromEvolution<
    LatestEvolution<TEvolutions>,
    false
  > extends never
    ? any
    : TypeFromEvolution<LatestEvolution<TEvolutions>, false> {
    return null as any;
  }

  parse<
    TOptions extends { includeVersion?: boolean },
    V extends EmptyEvolution = this['latest'],
  >(
    value: unknown,
    options?: TOptions,
  ): {
    value: TypeFromEvolution<
      V,
      TOptions['includeVersion'] extends boolean
        ? TOptions['includeVersion']
        : false
    >;
    meta: {
      original: TEvolutions[number]['version'];
      latest: LatestEvolution<TEvolutions>['version'];
    };
  } {
    // Get version of value provided.
    const { _v } = v.parse(versionSchema, value);

    // Find the evolution.
    const evolutionIndex = this.#evolutions.findIndex((v) => v.version === _v);
    const originalEvolution = this.#evolutions[evolutionIndex];
    if (evolutionIndex === -1 || !originalEvolution) {
      throw new Error('Evolution not found.');
    }

    const original: any = parse(originalEvolution.schema, value);
    let result = structuredClone(original);
    for (
      let i = evolutionIndex + 1, evolution = this.#evolutions[i];
      i < this.#evolutions.length;
      i++, evolution = this.#evolutions[i]
    ) {
      result = evolution.migrate?.(result) ?? result;
    }

    return {
      value: {
        ...result,
        ...((options?.includeVersion
          ? { _v: this.latest.version }
          : {}) as any),
      },
      meta: {
        original: _v,
        latest: this.latest.version,
      },
      // original,
    };
  }

  extend<S extends Schema>(schema: S) {
    return new ESchema(extendSchema<TEvolutions, S>(this.#evolutions, schema));
  }

  make(value: this['Type']) {
    return this.parse(
      {
        ...value,
        _v: this.latest.version,
      },
      { includeVersion: true },
    ).value;
  }
  makePartial(
    value: Partial<this['Type']>,
  ): Partial<TypeFromEvolution<LatestEvolution<TEvolutions>>> {
    return {
      ...parsePartial(this.latest.schema, value),
      _v: this.latest.version,
    } as any;
  }
}

export class ESchemaWithName<
  TName extends string,
  TEvolutions extends EmptyEvolution[],
> extends ESchema<TEvolutions> {
  name: string;
  evolutions: TEvolutions;
  constructor(name: TName, evolutions: TEvolutions) {
    super(evolutions);
    this.name = name;
    this.evolutions = evolutions;
  }

  extend<S extends Schema, Evolutions extends EmptyEvolution[] = TEvolutions>(
    schema: S,
  ) {
    const newEvolutions = extendSchema<Evolutions, S>(
      this.evolutions as any,
      schema,
    );
    return new ESchemaWithName(this.name, newEvolutions);
  }

  get eschema() {
    return new ESchema(this.evolutions);
  }
}

class Builder<TEvolutions extends EmptyEvolution[]> {
  #evolutions: TEvolutions;

  constructor(evolutions: TEvolutions) {
    this.#evolutions = evolutions;
  }

  evolve<
    V extends string,
    S extends Schema,
    Input extends ResolveWrapper<
      [EvolutionSchemaMap<TEvolutions>],
      ExcludeKeys<S, '_v', 'It is used internally.'>
    >,
  >(
    version: V extends TEvolutions[number]['version']
      ? `${V} is already used.`
      : V,
    schema: Input,
    migrate: (
      value: TypeFromSchema<LatestEvolution<TEvolutions>['schema']>,
    ) => TypeFromSchema<ResolveType<Input>>,
  ) {
    const schemaMap = this.#evolutions.reduce(
      (agg, v) => ({ ...agg, [v.version]: v.schema }),
      {},
    );
    const resultSchema = resolveValue(schema, [schemaMap]);
    return new Builder<
      [
        ...TEvolutions,
        {
          migrate: (
            value: TypeFromSchema<LatestEvolution<TEvolutions>['schema']>,
          ) => TypeFromSchema<ResolveType<Input>>;
          version: V;
          schema: ResolveType<Input>;
        },
      ]
    >([
      ...this.#evolutions,
      {
        version: version as any,
        schema: resultSchema,
        migrate,
      },
    ]);
  }

  name<Name extends string>(name: Name) {
    return {
      build: () => new ESchemaWithName(name, this.#evolutions),
    };
  }

  build() {
    return new ESchema(this.#evolutions);
  }
}
