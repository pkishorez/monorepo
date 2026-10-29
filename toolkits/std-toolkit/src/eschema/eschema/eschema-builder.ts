import type {
  AppendVersion,
  DeltaSchema,
  Evolution,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  MergeSchemas,
  NextVersion,
  StructFieldsType,
  StructFieldsSchema,
  VersionShapes,
} from '../domain/schema-model/index.js';
import { mergeDelta } from '../domain/schema-model/index.js';
import type { ESchema } from './eschema.js';

export class ESchemaBuilder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TVersions extends VersionShapes,
> {
  constructor(
    private readonly name: TName,
    private readonly evolutions: readonly Evolution[],
    readonly version: TVersion,
    private readonly finish: <
      V extends string,
      S extends StructFieldsSchema,
      H extends VersionShapes,
    >(
      version: V,
      evolutions: readonly Evolution[],
    ) => ESchema<V, S, TName, H>,
  ) {}

  /**
   * Appends the next version. Without a migration it is a gap version: a
   * value stored before it reads only once a Backfill has rewritten it.
   */
  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
  ): ESchemaBuilder<
    TName,
    V,
    MergeSchemas<TLatest, D>,
    AppendVersion<TVersions, V, MergeSchemas<TLatest, D>, true>
  >;
  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
    migration: (
      previous: StructFieldsType<TLatest>,
    ) => StructFieldsType<MergeSchemas<TLatest, D>>,
  ): ESchemaBuilder<
    TName,
    V,
    MergeSchemas<TLatest, D>,
    AppendVersion<TVersions, V, MergeSchemas<TLatest, D>, false>
  >;
  evolve(
    version: string,
    delta: DeltaSchema,
    migration?: (previous: any) => any,
  ): ESchemaBuilder<TName, any, any, any> {
    const previous = this.evolutions.at(-1)?.schema ?? {};
    const evolutions = [
      ...this.evolutions,
      {
        version,
        schema: mergeDelta(previous, delta),
        migration: migration ?? null,
      },
    ];
    return new ESchemaBuilder(this.name, evolutions, version, this.finish);
  }

  build(): ESchema<TVersion, TLatest, TName, TVersions> {
    return this.finish<TVersion, TLatest, TVersions>(
      this.version,
      this.evolutions,
    );
  }
}
