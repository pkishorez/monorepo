import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import {
  where,
  getSkOrderDirection,
  type SkQuery,
} from "../sql/helpers/index.js";
import {
  isoNow,
  idxPkCol,
  idxSkCol,
  RowMetaSchema,
  type RawRow,
  type RowMeta,
  type EntityResult,
  type QueryResult,
  type KeyDef,
} from "./utils.js";

export class SQLiteTable<
  TSchema extends AnyESchema,
  TIndexes extends Record<string, KeyDef<ESchemaType<TSchema>>> = {},
> {
  static make<S extends AnyESchema>(
    schema: S,
    primaryKey: KeyDef<ESchemaType<S>>,
  ) {
    return new SQLiteTableBuilder<S, {}>(schema, primaryKey, {});
  }

  private constructor(
    readonly schema: TSchema,
    readonly primaryKey: KeyDef<ESchemaType<TSchema>>,
    readonly indexes: TIndexes,
  ) {}

  get tableName(): string {
    return this.schema.name;
  }

  setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const columns = [
        "pk TEXT NOT NULL",
        "sk TEXT NOT NULL",
        "_data TEXT NOT NULL",
        "_v TEXT NOT NULL",
        "_i INTEGER NOT NULL DEFAULT 0",
        "_u TEXT NOT NULL",
        "_c TEXT NOT NULL",
        "_d INTEGER NOT NULL DEFAULT 0",
      ];

      yield* db.createTable(this.tableName, columns, ["pk", "sk"]);

      for (const indexName of Object.keys(this.indexes)) {
        yield* db.addColumn(this.tableName, idxPkCol(indexName), "TEXT");
        yield* db.addColumn(this.tableName, idxSkCol(indexName), "TEXT");
        yield* db.createIndex(
          this.tableName,
          `idx_${this.tableName}_${indexName}`,
          [idxPkCol(indexName), idxSkCol(indexName)],
        );
      }
    });
  }

  insert(
    value: ESchemaType<TSchema>,
  ): Effect.Effect<
    EntityResult<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const pk = this.primaryKey.pk(value);
      const sk = this.primaryKey.sk(value);
      const now = isoNow();

      const { data: encodedData, meta: schemaMeta } = yield* this.schema
        .encode(value)
        .pipe(
          Effect.mapError((cause) =>
            SqliteDBError.insertFailed(this.tableName, cause),
          ),
        );

      const indexColumns = this.#deriveIndexColumns(value);

      const meta: RowMeta = {
        _v: schemaMeta._v,
        _i: 0,
        _u: now,
        _c: now,
        _d: false,
      };

      const encodedMeta = Schema.encodeSync(RowMetaSchema)(meta);

      yield* db.insert(this.tableName, {
        pk,
        sk,
        _data: JSON.stringify(encodedData),
        ...encodedMeta,
        ...indexColumns,
      });

      return { data: value, meta };
    });
  }

  update(
    keyValue: ESchemaType<TSchema>,
    updates: Partial<ESchemaType<TSchema>>,
  ): Effect.Effect<
    EntityResult<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.#getRow(keyValue);

      const merged = { ...existing.data, ...updates } as ESchemaType<TSchema>;
      const pk = this.primaryKey.pk(keyValue);
      const sk = this.primaryKey.sk(keyValue);
      const w = where({ pk, sk });

      const { data: encodedData, meta: schemaMeta } = yield* this.schema
        .encode(merged)
        .pipe(
          Effect.mapError((cause) =>
            SqliteDBError.updateFailed(this.tableName, cause),
          ),
        );

      const indexColumns = this.#deriveIndexColumns(merged);

      yield* db.update(
        this.tableName,
        {
          _data: JSON.stringify(encodedData),
          _v: schemaMeta._v,
          ...indexColumns,
        },
        w,
      );

      return yield* this.#getRow(keyValue);
    });
  }

  delete(
    keyValue: ESchemaType<TSchema>,
  ): Effect.Effect<
    EntityResult<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.#getRow(keyValue);

      const pk = this.primaryKey.pk(keyValue);
      const sk = this.primaryKey.sk(keyValue);
      const w = where({ pk, sk });

      yield* db.update(this.tableName, { _d: 1 }, w);

      return { ...existing, meta: { ...existing.meta, _d: true } };
    });
  }

  query(params: {
    pk: Partial<ESchemaType<TSchema>>;
    sk: SkQuery;
    limit?: number;
  }): Effect.Effect<
    QueryResult<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const pk = this.primaryKey.pk(params.pk as ESchemaType<TSchema>);
      const w = where({ pk, sk: params.sk });
      const orderBy = getSkOrderDirection(params.sk);

      const rows = yield* db.query<RawRow>(this.tableName, w, {
        orderBy,
        limit: params.limit ?? 100,
      });

      const items: EntityResult<ESchemaType<TSchema>>[] = [];
      for (const row of rows) {
        items.push(yield* this.#parseRow(row));
      }

      return { items };
    });
  }

  index<N extends keyof TIndexes & string>(indexName: N) {
    const indexDef = this.indexes[indexName]!;
    const pkCol = idxPkCol(indexName);
    const skCol = idxSkCol(indexName);

    return {
      query: (params: {
        pk: Partial<ESchemaType<TSchema>>;
        sk: SkQuery;
        limit?: number;
      }): Effect.Effect<
        QueryResult<ESchemaType<TSchema>>,
        SqliteDBError,
        SqliteDB
      > => {
        return Effect.gen(this, function* () {
          const db = yield* SqliteDB;
          const pk = indexDef.pk(params.pk as ESchemaType<TSchema>);
          const orderBy = getSkOrderDirection(params.sk);
          const w = where({ pk, sk: params.sk }, { pk: pkCol, sk: skCol });

          const rows = yield* db.query<RawRow>(this.tableName, w, {
            orderBy,
            limit: params.limit ?? 100,
          });

          const items: EntityResult<ESchemaType<TSchema>>[] = [];
          for (const row of rows) {
            items.push(yield* this.#parseRow(row));
          }

          return { items };
        });
      },
    };
  }

  #getRow(
    keyValue: ESchemaType<TSchema>,
  ): Effect.Effect<
    EntityResult<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const pk = this.primaryKey.pk(keyValue);
      const sk = this.primaryKey.sk(keyValue);
      const w = where({ pk, sk });

      const row = yield* db.get<RawRow>(this.tableName, w);
      return yield* this.#parseRow(row);
    });
  }

  #parseRow(
    row: RawRow,
  ): Effect.Effect<EntityResult<ESchemaType<TSchema>>, SqliteDBError> {
    return Effect.gen(this, function* () {
      const rawData = JSON.parse(row._data);

      const { data } = yield* this.schema
        .decode(rawData)
        .pipe(
          Effect.mapError((cause) =>
            SqliteDBError.queryFailed(this.tableName, cause),
          ),
        );

      const meta = Schema.decodeSync(RowMetaSchema)({
        _v: row._v,
        _i: row._i,
        _u: row._u,
        _c: row._c,
        _d: row._d,
      });

      return { data: data as ESchemaType<TSchema>, meta };
    });
  }

  #deriveIndexColumns(value: ESchemaType<TSchema>): Record<string, string> {
    const columns: Record<string, string> = {};

    for (const [indexName, indexDef] of Object.entries(this.indexes)) {
      columns[idxPkCol(indexName)] = indexDef.pk(value);
      columns[idxSkCol(indexName)] = indexDef.sk(value);
    }

    return columns;
  }
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
