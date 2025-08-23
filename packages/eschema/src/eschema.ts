import type {
  EnsureUniqueVersion,
  Evolution,
  EvolutionsToObject,
  ResolveType,
} from './types.js';
import { Effect, identity, Schema } from 'effect';
import { ESchemaParseError } from './errors.js';
import { evolutionsToObject, extractVersion, resolveValue } from './util.js';

export class ESchema<
  LatestSch extends Schema.Schema<any>,
  Evolutions extends Evolution<any, any>[],
> {
  #evolutions: Evolutions;

  constructor(evolutions: Evolutions) {
    this.#evolutions = evolutions;
  }

  static make<Version extends string, Sch extends Schema.Schema<any, any, any>>(
    version: Version,
    schema: Sch,
  ) {
    // Automatically attach metadata to the schema
    const enhancedEvolution = {
      version,
      evolution: schema,
      migration: identity as () => Schema.Schema.Type<Sch>,
    } as Evolution<Version, Sch>;

    return new Builder([enhancedEvolution], enhancedEvolution.evolution);
  }

  #latest() {
    return this.#evolutions[this.#evolutions.length - 1];
  }
  get schema(): LatestSch {
    return this.#evolutions[this.#evolutions.length - 1].evolution;
  }

  make: (
    data: Schema.Schema.Type<LatestSch>,
  ) => Schema.Schema.Type<LatestSch> & { __v: string } = <
    D extends Schema.Schema.Type<LatestSch>,
  >(
    data: D,
  ): D & { __v: string } => {
    const val = Schema.decodeUnknownSync(this.schema)(data);

    return {
      ...(val as any),
      __v: this.#latest().version,
    };
  };

  makePartial: (
    data: Partial<Schema.Schema.Type<LatestSch>>,
  ) => Partial<Schema.Schema.Type<LatestSch>> & { __v: string } = <
    D extends Partial<Schema.Schema.Type<LatestSch>>,
  >(
    data: D,
  ): D & { __v: string } => {
    const val = Schema.decodeUnknownSync(Schema.partial(this.schema))(data);

    return {
      ...(val as any),
      __v: this.#latest().version,
    };
  };

  parse: (
    data: unknown,
  ) => Effect.Effect<Schema.Schema.Type<LatestSch>, ESchemaParseError> = (
    data: unknown,
  ) => {
    const evolutions = this.#evolutions;

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
      let currentValue: any;

      currentValue = yield* Schema.decodeUnknown(
        evolution.evolution as Schema.Schema<any, any, never>,
      )(data).pipe(
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

      return currentValue as Schema.Schema.Type<LatestSch>;
    });
  };
}

class Builder<Evolutions extends Evolution<any, any>[], Prev> {
  #evolutions: Evolutions;

  constructor(evolutions: Evolutions, _prev: Prev) {
    this.#evolutions = evolutions;
  }

  evolve<
    Version extends string,
    SchemaOrFn extends
      | Schema.Schema<any, any, any>
      | ((obj: EvolutionsToObject<Evolutions>) => Schema.Schema<any, any, any>),
  >(
    version: EnsureUniqueVersion<Version, Evolutions>,
    schemaOrFn: SchemaOrFn,
    migration: (
      value: Schema.Schema.Type<Prev>,
      v: (
        val: Schema.Schema.Type<ResolveType<SchemaOrFn>>,
      ) => Schema.Schema.Type<ResolveType<SchemaOrFn>>,
    ) => Schema.Schema.Type<ResolveType<SchemaOrFn>>,
  ): Builder<
    [...Evolutions, Evolution<Version, ResolveType<SchemaOrFn>>],
    ResolveType<SchemaOrFn>
  > {
    const evolutionsObj = evolutionsToObject(this.#evolutions);
    const resolvedSchema =
      typeof schemaOrFn === 'function' && !('ast' in schemaOrFn)
        ? resolveValue(schemaOrFn, evolutionsObj)
        : resolveValue(schemaOrFn);

    const newEvolution = {
      version,
      evolution: resolvedSchema,
      migration,
    } as Evolution<Version, ResolveType<SchemaOrFn>>;

    const newEvolutions = [...this.#evolutions, newEvolution] as unknown as [
      ...Evolutions,
      Evolution<Version, ResolveType<SchemaOrFn>>,
    ];

    return new Builder(newEvolutions, resolvedSchema);
  }

  build(): ESchema<Prev extends Schema.Schema<any> ? Prev : never, Evolutions> {
    return new ESchema(this.#evolutions);
  }
}
