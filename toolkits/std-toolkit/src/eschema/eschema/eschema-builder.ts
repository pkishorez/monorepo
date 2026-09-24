import type {
  DeltaSchema,
  Evolution,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  MergeSchemas,
  NextVersion,
  StructFieldsDecoded,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { mergeDelta } from '../domain/schema-model/index.js';
import type { ESchema } from './eschema.js';

export class ESchemaBuilder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private readonly name: TName,
    private readonly evolutions: readonly Evolution[],
    readonly version: TVersion,
    private readonly finish: <V extends string, S extends StructFieldsSchema>(
      version: V,
      evolutions: readonly Evolution[],
    ) => ESchema<V, S, TName>,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
    migration: (
      previous: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    const previous = this.evolutions.at(-1)?.schema ?? {};
    const evolutions = [
      ...this.evolutions,
      {
        version,
        schema: mergeDelta(previous, delta),
        migration,
      },
    ];
    return new ESchemaBuilder<TName, V, MergeSchemas<TLatest, D>>(
      this.name,
      evolutions,
      version,
      this.finish,
    );
  }

  build(): ESchema<TVersion, TLatest, TName> {
    return this.finish<TVersion, TLatest>(this.version, this.evolutions);
  }
}
