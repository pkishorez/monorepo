import type {
  ForbidUndefinedValue,
  NextVersion,
  ValueEvolution,
  ValueSchema,
  ValueSchemaDecoded,
} from '../domain/schema-model/index.js';
import type { ValueESchema } from './value-eschema.js';

export class ValueESchemaBuilder<
  TVersion extends string,
  TLatest extends ValueSchema,
> {
  constructor(
    private readonly name: string,
    private readonly evolutions: readonly ValueEvolution[],
    readonly version: TVersion,
    private readonly finish: <V extends string, S extends ValueSchema>(
      version: V,
      evolutions: readonly ValueEvolution[],
    ) => ValueESchema<V, S>,
  ) {}

  evolve<V extends NextVersion<TVersion>, S extends ValueSchema>(
    version: V,
    schema: S & ForbidUndefinedValue<S>,
    migration: (previous: ValueSchemaDecoded<TLatest>) => ValueSchemaDecoded<S>,
  ) {
    return new ValueESchemaBuilder<V, S>(
      this.name,
      [...this.evolutions, { version, schema, migration }],
      version,
      this.finish,
    );
  }

  build(): ValueESchema<TVersion, TLatest> {
    return this.finish<TVersion, TLatest>(this.version, this.evolutions);
  }
}
