import type { Schema } from 'effect';
import type {
  DeltaSchema,
  Evolution,
  ForbidIdField,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  MergeSchemas,
  NextVersion,
  StructFieldsDecoded,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { mergeDelta } from '../domain/schema-model/index.js';
import type { EntityESchema } from './entity-eschema.js';

export class EntityESchemaBuilder<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private readonly name: TName,
    private readonly idField: TIdField,
    private readonly idSchema: Schema.Codec<string, string>,
    private readonly evolutions: readonly Evolution[],
    readonly version: TVersion,
    private readonly finish: <V extends string, S extends StructFieldsSchema>(
      version: V,
      evolutions: readonly Evolution[],
    ) => EntityESchema<TName, TIdField, V, S>,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D &
      ForbidUnderscorePrefix<D> &
      ForbidIdField<D, TIdField> &
      ForbidOptionalFields<D>,
    migration: (
      previous: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    const previous = this.evolutions.at(-1)?.schema ?? {};
    const schema = mergeDelta(previous, delta);
    schema[this.idField] = this.idSchema;
    const evolutions = [...this.evolutions, { version, schema, migration }];
    return new EntityESchemaBuilder<
      TName,
      TIdField,
      V,
      MergeSchemas<TLatest, D> & Record<TIdField, Schema.Codec<string, string>>
    >(this.name, this.idField, this.idSchema, evolutions, version, this.finish);
  }

  build(): EntityESchema<TName, TIdField, TVersion, TLatest> {
    return this.finish<TVersion, TLatest>(this.version, this.evolutions);
  }
}
