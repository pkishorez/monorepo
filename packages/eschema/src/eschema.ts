import type { LastArrayElement } from 'type-fest';
import type {
  EnsureUniqueVersion,
  Evolution,
  EvolutionsToObject,
  ExtendLatestEvolutionSchema,
  ResolveType,
} from './types.js';
import { Effect, identity, Schema } from 'effect';
import { ESchemaParseError } from './errors.js';
import { evolutionsToObject, extractVersion, resolveValue } from './util.js';

type SchemaFrom<TEvolutions extends Evolution<any, any>[]> =
  LastArrayElement<TEvolutions>['schema'];
type SchemaTypeFrom<TEvolutions extends Evolution<any, any>[]> =
  Schema.Schema.Type<SchemaFrom<TEvolutions>>;

export class ESchema<
  TEvolutions extends Evolution<string, Schema.Schema<any>>[],
> {
  #evolutions: TEvolutions;

  constructor(evolutions: TEvolutions) {
    this.#evolutions = evolutions;
  }

  static make<Version extends string, Sch extends Schema.Schema<any, any, any>>(
    version: Version,
    schema: Sch,
  ) {
    const enhancedEvolution = {
      version,
      schema,
      migration: identity as () => Schema.Schema.Type<Sch>,
    } as Evolution<Version, Sch>;

    return new Builder([enhancedEvolution] as const);
  }

  get #latest() {
    return this.#evolutions[
      this.#evolutions.length - 1
    ] as LastArrayElement<TEvolutions>;
  }

  get latestVersion(): LastArrayElement<TEvolutions>['version'] {
    return this.#latest.version;
  }
  get schema(): LastArrayElement<TEvolutions>['schema'] {
    return this.#latest.schema;
  }
  get schemaWithVersion(): Schema.Schema<
    SchemaTypeFrom<TEvolutions> & { __v: string }
  > {
    return Schema.extend(
      this.#evolutions[this.#evolutions.length - 1].schema,
      Schema.Struct({
        __v: Schema.Literal(this.#latest.version),
      }),
    ) as any;
  }

  extend = <Ext>(schema: Schema.Schema<Ext>) => {
    const evolutions = this.#evolutions.slice(0, -1);
    const last = this.#evolutions.at(-1)!;

    return new ESchema([
      ...evolutions,
      { ...last, schema: Schema.extend(last.schema, schema) } as Evolution<
        any,
        any
      >,
    ] as ExtendLatestEvolutionSchema<ESchema<TEvolutions>, Schema.Schema<Ext>>);
  };

  make: (
    data: SchemaTypeFrom<TEvolutions>,
  ) => SchemaTypeFrom<TEvolutions> & { __v: string } = <
    D extends SchemaTypeFrom<TEvolutions>,
  >(
    data: D,
  ): D & { __v: string } => {
    return Effect.runSync(this.makeEffect(data) as any);
  };

  makeEffect(data: SchemaTypeFrom<TEvolutions>) {
    const v = Schema.decodeUnknown(this.schema)(data);
    return v.pipe(
      Effect.map(
        (v: any) =>
          ({
            ...v,
            __v: this.#latest.version,
          }) as SchemaTypeFrom<TEvolutions> & { __v: string },
      ),
    );
  }

  makePartial = <D extends Partial<SchemaTypeFrom<TEvolutions>>>(
    data: D,
  ): Partial<SchemaTypeFrom<TEvolutions>> => {
    return Effect.runSync(this.makePartialEffect(data) as any);
  };

  makePartialEffect = <D extends Partial<SchemaTypeFrom<TEvolutions>>>(
    data: D,
  ) => {
    return Schema.decodeUnknown(Schema.partial(this.schema))(data).pipe(
      Effect.map(
        (v) =>
          ({
            ...v,
            __v: this.#latest.version,
          }) as Partial<D> & { __v: string },
      ),
    );
  };

  parse: (
    data: unknown,
    {
      onExcessProperty,
    }?: { onExcessProperty?: 'ignore' | 'preserve' | 'error' },
  ) => Effect.Effect<
    {
      value: SchemaTypeFrom<TEvolutions>;
      meta: {
        oldVersion: string;
        newVersion: string;
      };
    },
    ESchemaParseError
  > = (data, { onExcessProperty = 'ignore' } = {}) => {
    const evolutions = this.#evolutions;

    const th = this;

    return Effect.gen(function* () {
      // Step 1: Extract version from unknown data using schema
      const version = yield* extractVersion(data, evolutions);

      // Step 2: Find the evolution for this version
      const evolutionIndex = evolutions.findIndex(
        (evo) => evo.version === version,
      );
      if (evolutionIndex === -1) {
        return yield* Effect.fail(
          new ESchemaParseError({
            msg: `No evolution found for version "${version}". Available versions: ${evolutions.map((e) => e.version).join(', ')}`,
          }),
        );
      }

      // Step 3: Parse the data with the found evolution's schema
      const evolution = evolutions[evolutionIndex];
      let currentValue = yield* Schema.decodeUnknown(evolution.schema, {
        onExcessProperty,
      })(data).pipe(
        Effect.mapError(
          (err) =>
            new ESchemaParseError({
              msg: `Failed to parse data with version "${version}": ${err}`,
            }),
        ),
      );

      // Step 4: Apply migrations from found version to latest
      for (let i = evolutionIndex + 1; i < evolutions.length; i++) {
        const nextEvolution = evolutions[i];
        try {
          currentValue = (nextEvolution.migration as any)(
            currentValue,
            (v: any) => v,
          );
        } catch (error) {
          return yield* Effect.fail(
            new ESchemaParseError({
              msg: `Migration failed from "${evolutions[i - 1].version}" to "${nextEvolution.version}": ${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        }
      }

      return {
        value: currentValue as SchemaTypeFrom<TEvolutions>,
        meta: {
          oldVersion: evolution.version,
          newVersion: th.#latest.version,
        },
      };
    });
  };
}

class Builder<TEvolutions extends Evolution<any, any>[]> {
  #evolutions: TEvolutions;

  constructor(evolutions: TEvolutions) {
    this.#evolutions = evolutions;
  }

  evolve<
    Version extends string,
    SchemaOrFn extends
      | Schema.Schema<any, any, any>
      | ((
          obj: EvolutionsToObject<TEvolutions>,
        ) => Schema.Schema<any, any, any>),
  >(
    version: EnsureUniqueVersion<Version, TEvolutions>,
    schemaOrFn: SchemaOrFn,
    migration: (
      value: Schema.Schema.Type<LastArrayElement<TEvolutions>['schema']>,
      v: (
        val: Schema.Schema.Type<ResolveType<SchemaOrFn>>,
      ) => Schema.Schema.Type<ResolveType<SchemaOrFn>>,
    ) => Schema.Schema.Type<ResolveType<SchemaOrFn>>,
  ): Builder<[...TEvolutions, Evolution<Version, ResolveType<SchemaOrFn>>]> {
    const evolutionsObj = evolutionsToObject(this.#evolutions);
    const resolvedSchema =
      typeof schemaOrFn === 'function' && !Schema.isSchema(schemaOrFn)
        ? resolveValue(schemaOrFn, evolutionsObj)
        : resolveValue(schemaOrFn);

    const newEvolution = {
      version,
      schema: resolvedSchema,
      migration,
    } as Evolution<Version, ResolveType<SchemaOrFn>>;

    const newEvolutions = [...this.#evolutions, newEvolution] as unknown as [
      ...TEvolutions,
      Evolution<Version, ResolveType<SchemaOrFn>>,
    ];

    return new Builder(newEvolutions);
  }

  build(): ESchema<TEvolutions> {
    return new ESchema(this.#evolutions);
  }
}
