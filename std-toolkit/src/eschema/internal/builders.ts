import type {
  DeltaSchema,
  Evolution,
  ForbidIdField,
  ForbidOptionalFields,
  ForbidUndefinedValue,
  ForbidUnderscorePrefix,
  IdSchema,
  MergeSchemas,
  NextVersion,
  StructFieldsDecoded,
  StructFieldsSchema,
  ValueEvolution,
  ValueSchema,
  ValueSchemaDecoded,
} from '../types.js';
import { mergeDelta } from '../schema.js';
import {
  ESchema,
  SingleEntityESchema,
  EntityESchema,
  ValueESchema,
} from '../eschema.js';

function nextEvolutions(
  evolutions: Evolution[],
  version: string,
  delta: DeltaSchema,
  migration: (prev: any) => any,
  postMerge?: (merged: StructFieldsSchema) => void,
): Evolution[] {
  const prevSchema = evolutions.at(-1)?.schema ?? {};
  const merged = mergeDelta(prevSchema, delta);
  postMerge?.(merged);
  return [...evolutions, { version, schema: merged, migration }];
}

function nextValueEvolutions(
  evolutions: ValueEvolution[],
  version: string,
  schema: ValueSchema,
  migration: (prev: any) => any,
): ValueEvolution[] {
  return [...evolutions, { version, schema, migration }];
}

export class ESchemaBuilder<
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private name: string,
    private evolutions: Evolution[],
    readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
    migration: (
      prev: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    return new ESchemaBuilder<V, MergeSchemas<TLatest, D>>(
      this.name,
      nextEvolutions(this.evolutions, version, delta, migration),
      version,
    );
  }

  build() {
    return new ESchema<TVersion, TLatest>(
      this.name,
      this.version,
      this.evolutions,
    );
  }
}

export class SingleEntityESchemaBuilder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private name: TName,
    private evolutions: Evolution[],
    readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
    migration: (
      prev: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    return new SingleEntityESchemaBuilder<TName, V, MergeSchemas<TLatest, D>>(
      this.name,
      nextEvolutions(this.evolutions, version, delta, migration),
      version,
    );
  }

  build() {
    return new SingleEntityESchema<TName, TVersion, TLatest>(
      this.name,
      this.version,
      this.evolutions,
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
    private evolutions: Evolution[],
    private readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D &
      ForbidUnderscorePrefix<D> &
      ForbidIdField<D, TIdField> &
      ForbidOptionalFields<D>,
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
      nextEvolutions(this.evolutions, version, delta, migration, (merged) => {
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
      this.evolutions,
    );
  }
}

export class ValueESchemaBuilder<
  TVersion extends string,
  TLatest extends ValueSchema,
> {
  constructor(
    private name: string,
    private evolutions: ValueEvolution[],
    readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, S extends ValueSchema>(
    version: V,
    schema: S & ForbidUndefinedValue<S>,
    migration: (prev: ValueSchemaDecoded<TLatest>) => ValueSchemaDecoded<S>,
  ) {
    return new ValueESchemaBuilder<V, S>(
      this.name,
      nextValueEvolutions(this.evolutions, version, schema, migration),
      version,
    );
  }

  build() {
    return new ValueESchema<TVersion, TLatest>(
      this.name,
      this.version,
      this.evolutions,
    );
  }
}
