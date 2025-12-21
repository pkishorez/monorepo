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
import { StandardSchemaV1 } from '@standard-schema/spec';

const versionSchema = v.object({ _v: v.string() });
export type EmptyESchema = ESchema<EmptyEvolution[]>;
export class ESchema<TEvolutions extends EmptyEvolution[]> {
  protected 'evolutions': TEvolutions;
  'constructor'(evolutions: TEvolutions) {
    this.evolutions = evolutions;
  }

  get 'latest'(): LatestEvolution<TEvolutions> extends never
    ? EmptyEvolution
    : LatestEvolution<TEvolutions> {
    return this.evolutions[this.evolutions.length - 1] as any;
  }
  get 'schema'(): LatestEvolution<TEvolutions>['schema'] {
    return this.evolutions[this.evolutions.length - 1].schema;
  }

  get 'Type'(): TypeFromEvolution<
    LatestEvolution<TEvolutions>,
    false
  > extends never
    ? any
    : TypeFromEvolution<LatestEvolution<TEvolutions>, false> {
    return null as any;
  }

  'parse'<
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
    const evolutionIndex = this.evolutions.findIndex((v) => v.version === _v);
    const originalEvolution = this.evolutions[evolutionIndex];
    if (evolutionIndex === -1 || !originalEvolution) {
      throw new Error('Evolution not found.');
    }

    const original: any = parse(originalEvolution.schema, value);
    let result = structuredClone(original);
    for (
      let i = evolutionIndex + 1, evolution = this.evolutions[i];
      i < this.evolutions.length;
      i++, evolution = this.evolutions[i]
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

  'extend'<S extends Schema>(schema: S) {
    return new ESchema(extendSchema<TEvolutions, S>(this.evolutions, schema));
  }

  'make'(value: this['Type']) {
    return this.parse(
      {
        ...value,
        _v: this.latest.version,
      },
      { includeVersion: true },
    ).value;
  }
  'makePartial'(
    value: Partial<this['Type']>,
  ): Partial<TypeFromEvolution<LatestEvolution<TEvolutions>>> {
    return {
      ...parsePartial(this.latest.schema, value),
      _v: this.latest.version,
    } as any;
  }

  readonly '~standard': StandardSchemaV1.Props<this['Type']> = {
    version: 1,
    validate: (value) => {
      return this.parse(value);
    },
    vendor: 'eschema',
  };
}

class Builder<TEvolutions extends EmptyEvolution[]> {
  constructor(protected evolutions: TEvolutions) {}

  evolve<
    V extends string,
    S extends Schema,
    Input extends ResolveWrapper<
      [EvolutionSchemaMap<TEvolutions>],
      ExcludeKeys<S, `_${string}`, 'keys with _ prefix are not allowed.'>
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
    const schemaMap = this.evolutions.reduce(
      (agg, v) => ({ ...agg, [v.version]: v.schema }),
      {},
    );
    const resultSchema = resolveValue(schema, [schemaMap]);
    return new Builder([
      ...this.evolutions,
      {
        version: version as any,
        schema: resultSchema,
        migrate,
      },
    ]) as Builder<
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
    >;
  }

  build() {
    return new ESchema(this.evolutions);
  }
}

export function makeESchema<S extends Schema>(schema: S) {
  return new Builder<[{ version: 'v1'; schema: S; migrate: null }]>([
    {
      version: 'v1',
      schema,
      migrate: null,
    },
  ]);
}
