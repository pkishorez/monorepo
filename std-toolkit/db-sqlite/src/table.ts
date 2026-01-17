import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";

interface KeyDef<T> {
  pk: (entity: T) => string;
  sk: (entity: T) => string;
}

export class SQLiteTable<
  TSchema extends AnyESchema,
  TIndexes extends Record<string, KeyDef<ESchemaType<TSchema>>> = {},
> {
  static make<S extends AnyESchema>(schema: S, primaryKey: KeyDef<ESchemaType<S>>) {
    return new SQLiteTableBuilder<S, {}>(schema, primaryKey, {});
  }

  private constructor(
    readonly schema: TSchema,
    readonly primaryKey: KeyDef<ESchemaType<TSchema>>,
    readonly indexes: TIndexes,
  ) {}

  // TODO: setup() - create table
  // TODO: get(keyValue) - get by pk+sk
  // TODO: insert(value) - insert row
  // TODO: update(keyValue, updates) - update row
  // TODO: delete(keyValue) - soft delete
  // TODO: query(params) - query by pk + sk range
  // TODO: index(name).query(params) - query GSI
}

class SQLiteTableBuilder<
  TSchema extends AnyESchema,
  TIndexes extends Record<string, KeyDef<ESchemaType<TSchema>>>,
> {
  constructor(
    private _schema: TSchema,
    private _primaryKey: KeyDef<ESchemaType<TSchema>>,
    private _indexes: TIndexes,
  ) {}

  index<N extends string>(
    name: N,
    def: KeyDef<ESchemaType<TSchema>>,
  ): SQLiteTableBuilder<TSchema, TIndexes & { [K in N]: typeof def }> {
    return new SQLiteTableBuilder(this._schema, this._primaryKey, {
      ...this._indexes,
      [name]: def,
    } as TIndexes & { [K in N]: typeof def });
  }

  build(): SQLiteTable<TSchema, TIndexes> {
    return new (SQLiteTable as any)(
      this._schema,
      this._primaryKey,
      this._indexes,
    );
  }
}
