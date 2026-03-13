import { Schema } from "effect";
import type {
  DeltaSchema,
  Evolution,
  ForbidIdField,
  ForbidUnderscorePrefix,
  IdSchema,
  MergeSchemas,
  NextVersion,
  StructFieldsDecoded,
  StructFieldsSchema,
} from "../types.js";
import { mergeDelta } from "../schema.js";
import { ESchema, SingleEntityESchema, EntityESchema } from "../eschema.js";

function nextEvolutions(
  migrations: Evolution[],
  version: string,
  delta: DeltaSchema,
  migration: (prev: any) => any,
  postMerge?: (merged: StructFieldsSchema) => void,
): Evolution[] {
  const prevSchema = migrations.at(-1)?.schema ?? {};
  const merged = mergeDelta(prevSchema, delta);
  postMerge?.(merged);
  return [...migrations, { version, schema: merged, migration }];
}

export class ESchemaBuilder<
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private migrations: Evolution[],
    readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D>,
    migration: (
      prev: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    return new ESchemaBuilder<V, MergeSchemas<TLatest, D>>(
      nextEvolutions(this.migrations, version, delta, migration),
      version,
    );
  }

  build() {
    return new ESchema<TVersion, TLatest>(this.version, this.migrations);
  }
}

export class SingleEntityESchemaBuilder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private name: TName,
    private migrations: Evolution[],
    readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D>,
    migration: (
      prev: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    return new SingleEntityESchemaBuilder<TName, V, MergeSchemas<TLatest, D>>(
      this.name,
      nextEvolutions(this.migrations, version, delta, migration),
      version,
    );
  }

  build() {
    return new SingleEntityESchema<TName, TVersion, TLatest>(
      this.name,
      this.version,
      this.migrations,
    );
  }
}

export class EntityESchemaBuilder<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private name: TName,
    private _idField: TIdField,
    private _idSchema: IdSchema,
    private migrations: Evolution[],
    private readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidIdField<D, TIdField>,
    migration: (
      prev: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    return new EntityESchemaBuilder<
      TName,
      TIdField,
      V,
      MergeSchemas<TLatest, D> & Record<TIdField, IdSchema>
    >(
      this.name,
      this._idField,
      this._idSchema,
      nextEvolutions(this.migrations, version, delta, migration, (merged) => {
        merged[this._idField] = this._idSchema;
      }),
      version,
    );
  }

  build() {
    return new EntityESchema<TName, TIdField, TVersion, TLatest>(
      this.name,
      this._idField,
      this.version,
      this.migrations,
    );
  }
}
