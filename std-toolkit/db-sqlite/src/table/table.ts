import {
  metaSchema,
  type AnyESchema,
  type ESchemaType,
} from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import * as Sql from "../sql/helpers/index.js";
import {
  idxKeyCol,
  computeKey,
  extractKeyOp,
  getKeyOpOrderDirection,
  RowMetaSchema,
  type RawRow,
  type RowMeta,
  type EntityResult,
  type QueryResult,
  type KeyOp,
} from "./utils.js";

// Meta fields available for indexing
type IndexableMetaFields = "_v" | "_u" | "_c";

// Entity combined with indexable meta fields
type EntityWithMeta<TEntity> = TEntity & Record<IndexableMetaFields, string>;

// All fields available for indexing (entity fields + meta fields)
type IndexableFields<TEntity> = keyof TEntity | IndexableMetaFields;

type IndexDef<TEntity> = {
  readonly fields: readonly IndexableFields<TEntity>[];
};

// Derive KeyOp type based on key name
type QueryKeyOp<
  TEntity,
  TPrimaryKeyFields extends keyof TEntity,
  TIndexes extends Record<string, IndexDef<TEntity>>,
  K extends "pk" | keyof TIndexes,
> = K extends "pk"
  ? KeyOp<Pick<TEntity, TPrimaryKeyFields>>
  : K extends keyof TIndexes
    ? KeyOp<Pick<EntityWithMeta<TEntity>, TIndexes[K]["fields"][number]>>
    : never;

// Query options
type QueryOptions = {
  limit?: number;
};

export class SQLiteTable<
  TSchema extends AnyESchema,
  TEntity = ESchemaType<TSchema>,
  TPrimaryKeyFields extends keyof TEntity = never,
  TIndexes extends Record<string, IndexDef<TEntity>> = {},
> {
  static make<S extends AnyESchema>(schema: S) {
    return {
      primary<K extends keyof ESchemaType<S>>(fields: readonly K[]) {
        return new SQLiteTableBuilder<S, ESchemaType<S>, K, {}>(
          schema,
          fields,
          {} as {},
        );
      },
    };
  }

  private constructor(
    readonly schema: TSchema,
    readonly primaryKeyFields: readonly TPrimaryKeyFields[],
    readonly indexes: TIndexes,
  ) {}

  get tableName(): string {
    return this.schema.name;
  }

  setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const columns = [
        Sql.column({ name: "key", type: "TEXT" }),
        Sql.column({ name: "_data", type: "TEXT" }),
        Sql.column({ name: "_v", type: "TEXT" }),
        Sql.column({ name: "_i", type: "INTEGER", default: 0 }),
        Sql.column({ name: "_u", type: "TEXT", default: Sql.ISO_NOW }),
        Sql.column({ name: "_c", type: "TEXT", default: Sql.ISO_NOW }),
        Sql.column({ name: "_d", type: "INTEGER", default: 0 }),
      ];

      yield* db.createTable(this.tableName, columns, ["key"]);

      for (const indexName of Object.keys(this.indexes)) {
        yield* db.addColumn(this.tableName, idxKeyCol(indexName), "TEXT");
        yield* db.createIndex(
          this.tableName,
          `idx_${this.tableName}_${indexName}`,
          [idxKeyCol(indexName)],
        );
      }
    });
  }

  insert(
    value: TEntity,
  ): Effect.Effect<EntityResult<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const key = computeKey(this.primaryKeyFields, value);
      const now = new Date().toISOString();

      const { data: encodedData, meta: schemaMeta } = yield* this.schema
        .encode(value as Record<string, unknown>)
        .pipe(
          Effect.mapError((cause) =>
            SqliteDBError.insertFailed(this.tableName, cause),
          ),
        );

      const meta: RowMeta = {
        _v: schemaMeta._v,
        _i: 0,
        _u: now,
        _c: now,
        _d: false,
      };

      const indexColumns = this.#deriveIndexColumns(value, meta);

      yield* db.insert(this.tableName, {
        key,
        _data: JSON.stringify(encodedData),
        _v: meta._v,
        _i: meta._i,
        _u: meta._u,
        _c: meta._c,
        _d: 0,
        ...indexColumns,
      });

      return { data: value, meta };
    });
  }

  update(
    keyValue: Pick<TEntity, TPrimaryKeyFields>,
    updates: Partial<TEntity>,
  ): Effect.Effect<EntityResult<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.#getRow(keyValue);

      const merged = { ...existing.data, ...updates } as TEntity;
      const key = computeKey(this.primaryKeyFields, keyValue as TEntity);
      const w = Sql.whereExact(key);

      const { data: encodedData, meta: schemaMeta } = yield* this.schema
        .encode(merged as Record<string, unknown>)
        .pipe(
          Effect.mapError((cause) =>
            SqliteDBError.updateFailed(this.tableName, cause),
          ),
        );

      const meta: RowMeta = {
        _v: schemaMeta._v,
        _i: existing.meta._i + 1,
        _u: new Date().toISOString(),
        _c: existing.meta._c,
        _d: existing.meta._d,
      };

      const indexColumns = this.#deriveIndexColumns(merged, meta);

      yield* db.update(
        this.tableName,
        {
          _data: JSON.stringify(encodedData),
          _v: meta._v,
          _i: meta._i,
          _u: meta._u,
          ...indexColumns,
        },
        w,
      );

      return { data: merged, meta };
    });
  }

  delete(
    keyValue: Pick<TEntity, TPrimaryKeyFields>,
  ): Effect.Effect<EntityResult<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.#getRow(keyValue);

      const key = computeKey(this.primaryKeyFields, keyValue as TEntity);
      const w = Sql.whereExact(key);

      yield* db.update(this.tableName, { _d: 1 }, w);

      return { ...existing, meta: { ...existing.meta, _d: true } };
    });
  }

  dangerouslyRemoveAllRows(
    confirm: "i know what i am doing",
  ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      if (confirm !== "i know what i am doing") {
        return yield* Effect.fail(
          SqliteDBError.deleteFailed(
            this.tableName,
            "Confirmation required: pass 'i know what i am doing'",
          ),
        );
      }
      const db = yield* SqliteDB;
      return yield* db.deleteAll(this.tableName);
    });
  }

  get(
    keyValue: Pick<TEntity, TPrimaryKeyFields>,
  ): Effect.Effect<EntityResult<TEntity>, SqliteDBError, SqliteDB> {
    return this.#getRow(keyValue);
  }

  query<K extends "pk" | (keyof TIndexes & string)>(
    key: K,
    op: QueryKeyOp<TEntity, TPrimaryKeyFields, TIndexes, K>,
    options?: QueryOptions,
  ): Effect.Effect<QueryResult<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;

      let fields: readonly IndexableFields<TEntity>[];
      let col: string;

      if (key === "pk") {
        fields = this.primaryKeyFields;
        col = "key";
      } else {
        const indexDef = this.indexes[key];
        if (!indexDef) {
          return yield* Effect.fail(
            SqliteDBError.queryFailed(
              this.tableName,
              new Error(`Unknown index: ${key}`),
            ),
          );
        }
        fields = indexDef.fields;
        col = idxKeyCol(key);
      }

      const { operator, value } = extractKeyOp(op);
      const computedKey = computeKey(fields, value as EntityWithMeta<TEntity>);

      const rows = yield* db.query<RawRow>(
        this.tableName,
        Sql.where(computedKey, operator as "<" | "<=" | ">" | ">=", col),
        {
          orderBy: getKeyOpOrderDirection(op),
          limit: options?.limit ?? 100,
        },
      );

      const items = yield* Effect.all(rows.map((row) => this.#parseRow(row)));
      return { items };
    });
  }

  #getRow(
    keyValue: Pick<TEntity, TPrimaryKeyFields>,
  ): Effect.Effect<EntityResult<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const key = computeKey(this.primaryKeyFields, keyValue as TEntity);
      const w = Sql.whereExact(key);

      const row = yield* db.get<RawRow>(this.tableName, w);
      return yield* this.#parseRow(row);
    });
  }

  #parseRow(row: RawRow): Effect.Effect<EntityResult<TEntity>, SqliteDBError> {
    return Effect.gen(this, function* () {
      const rawData = {
        ...JSON.parse(row._data),
        ...metaSchema.make({
          _v: row._v,
          _e: this.schema.name,
        }),
      };

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

      return { data: data as TEntity, meta };
    });
  }

  #deriveIndexColumns(
    value: TEntity,
    meta: Pick<RowMeta, "_v" | "_u" | "_c">,
  ): Record<string, string> {
    const columns: Record<string, string> = {};
    const combined = { ...value, ...meta } as EntityWithMeta<TEntity>;

    for (const [indexName, indexDef] of Object.entries(this.indexes)) {
      columns[idxKeyCol(indexName)] = computeKey(
        (indexDef as IndexDef<TEntity>).fields,
        combined,
      );
    }

    return columns;
  }
}

class SQLiteTableBuilder<
  TSchema extends AnyESchema,
  TEntity = ESchemaType<TSchema>,
  TPrimaryKeyFields extends keyof TEntity = never,
  TIndexes extends Record<string, IndexDef<TEntity>> = {},
> {
  constructor(
    private _schema: TSchema,
    private _primaryKeyFields: readonly TPrimaryKeyFields[],
    private _indexes: TIndexes,
  ) {}

  index<N extends string, K extends IndexableFields<TEntity>>(
    name: N,
    fields: readonly K[],
  ): SQLiteTableBuilder<
    TSchema,
    TEntity,
    TPrimaryKeyFields,
    TIndexes & { [I in N]: { fields: readonly K[] } }
  > {
    return new SQLiteTableBuilder(this._schema, this._primaryKeyFields, {
      ...this._indexes,
      [name]: { fields },
    } as TIndexes & { [I in N]: { fields: readonly K[] } });
  }

  build(): SQLiteTable<TSchema, TEntity, TPrimaryKeyFields, TIndexes> {
    return new (SQLiteTable as any)(
      this._schema,
      this._primaryKeyFields,
      this._indexes,
    );
  }
}
