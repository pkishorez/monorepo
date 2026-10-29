import type { Schema } from 'effect';
import type {
  AppendVersion,
  DeltaSchema,
  Evolution,
  ForbidIdField,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  MergeSchemas,
  NextVersion,
  StructFieldsType,
  StructFieldsSchema,
  VersionShapes,
} from '../domain/schema-model/index.js';
import { mergeDelta } from '../domain/schema-model/index.js';
import type { EntityESchema } from './entity-eschema.js';

type WithId<S extends StructFieldsSchema, TIdField extends string> = S &
  Record<TIdField, Schema.Codec<string, string>>;

export class EntityESchemaBuilder<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TVersions extends VersionShapes,
> {
  constructor(
    private readonly name: TName,
    private readonly idField: TIdField,
    private readonly idSchema: Schema.Codec<string, string>,
    private readonly evolutions: readonly Evolution[],
    readonly version: TVersion,
    private readonly finish: <
      V extends string,
      S extends StructFieldsSchema,
      H extends VersionShapes,
    >(
      version: V,
      evolutions: readonly Evolution[],
    ) => EntityESchema<TName, TIdField, V, S, H>,
  ) {}

  /**
   * Appends the next version. Without a migration it is a gap version: a
   * value stored before it reads only once a Backfill has rewritten it.
   */
  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D &
      ForbidUnderscorePrefix<D> &
      ForbidIdField<D, TIdField> &
      ForbidOptionalFields<D>,
  ): EntityESchemaBuilder<
    TName,
    TIdField,
    V,
    WithId<MergeSchemas<TLatest, D>, TIdField>,
    AppendVersion<
      TVersions,
      V,
      WithId<MergeSchemas<TLatest, D>, TIdField>,
      true
    >
  >;
  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D &
      ForbidUnderscorePrefix<D> &
      ForbidIdField<D, TIdField> &
      ForbidOptionalFields<D>,
    migration: (
      previous: StructFieldsType<TLatest>,
    ) => StructFieldsType<MergeSchemas<TLatest, D>>,
  ): EntityESchemaBuilder<
    TName,
    TIdField,
    V,
    WithId<MergeSchemas<TLatest, D>, TIdField>,
    AppendVersion<
      TVersions,
      V,
      WithId<MergeSchemas<TLatest, D>, TIdField>,
      false
    >
  >;
  evolve(
    version: string,
    delta: DeltaSchema,
    migration?: (previous: any) => any,
  ): EntityESchemaBuilder<TName, TIdField, any, any, any> {
    const previous = this.evolutions.at(-1)?.schema ?? {};
    const schema = mergeDelta(previous, delta);
    schema[this.idField] = this.idSchema;
    const evolutions = [
      ...this.evolutions,
      { version, schema, migration: migration ?? null },
    ];
    return new EntityESchemaBuilder(
      this.name,
      this.idField,
      this.idSchema,
      evolutions,
      version,
      this.finish,
    );
  }

  build(): EntityESchema<TName, TIdField, TVersion, TLatest, TVersions> {
    return this.finish<TVersion, TLatest, TVersions>(
      this.version,
      this.evolutions,
    );
  }
}
