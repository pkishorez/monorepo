import {
  metaSchema,
  type AnyESchema,
  type ESchemaType,
} from "@std-toolkit/eschema";
import { Effect, Option, Schema } from "effect";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import * as Sql from "../sql/helpers/index.js";
import { ConnectionService } from "@std-toolkit/core/server";
import {
  indexKeyColumn,
  computeKey,
  extractKeyOp,
  getKeyOpOrderDirection,
  fieldsToPattern,
  sqlMetaSchema,
  type RawRow,
  type RowMeta,
  type QueryResult,
  type KeyOp,
} from "./utils.js";
import type { StdDescriptor, IndexPatternDescriptor } from "@std-toolkit/core";
import { EntityType } from "@std-toolkit/core";

type MetaFields = "_v" | "_u" | "_c";
type WithMeta<T> = T & Record<MetaFields, string>;
type IndexableFields<T> = keyof T | MetaFields;
type IndexDef<T> = { readonly fields: readonly IndexableFields<T>[] };

type IndexKeyFields<
  TEntity,
  TPrimaryKey extends keyof TEntity,
  TIndexes extends Record<string, IndexDef<TEntity>>,
  K extends "pk" | keyof TIndexes,
> = K extends "pk"
  ? Pick<TEntity, TPrimaryKey>
  : K extends keyof TIndexes
    ? Pick<WithMeta<TEntity>, TIndexes[K]["fields"][number]>
    : never;

type QueryKeyOp<
  E,
  PK extends keyof E,
  I extends Record<string, IndexDef<E>>,
  K extends "pk" | keyof I,
> = KeyOp<IndexKeyFields<E, PK, I, K>>;

const TABLE_COLUMNS = [
  Sql.column({ name: "key", type: "TEXT" }),
  Sql.column({ name: "_data", type: "TEXT" }),
  Sql.column({ name: "_v", type: "TEXT" }),
  Sql.column({ name: "_i", type: "INTEGER", default: 0 }),
  Sql.column({ name: "_u", type: "TEXT", default: Sql.ISO_NOW }),
  Sql.column({ name: "_c", type: "TEXT", default: Sql.ISO_NOW }),
  Sql.column({ name: "_d", type: "INTEGER", default: 0 }),
];

export class SQLiteTable<
  TSchema extends AnyESchema,
  TEntity = ESchemaType<TSchema>,
  TPrimaryKey extends keyof TEntity = never,
  TIndexes extends Record<string, IndexDef<TEntity>> = {},
> {
  static make<S extends AnyESchema>(schema: S) {
    return {
      primary<K extends keyof ESchemaType<S>>(fields: readonly K[]) {
        return new SQLiteTableBuilder<S, ESchemaType<S>, K, {}>(schema, fields, {} as {});
      },
    };
  }

  private constructor(
    readonly schema: TSchema,
    readonly primaryKeyFields: readonly TPrimaryKey[],
    readonly indexes: TIndexes,
  ) {}

  get tableName(): string {
    return this.schema.name;
  }

  setup(): Effect.Effect<void, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      yield* db.createTable(this.tableName, TABLE_COLUMNS, ["key"]);

      for (const name of Object.keys(this.indexes)) {
        const col = indexKeyColumn(name);
        yield* db.addColumn(this.tableName, col, "TEXT");
        yield* db.createIndex(this.tableName, `idx_${this.tableName}_${name}`, [col]);
      }
    });
  }

  insert(
    input: Omit<TEntity, "_v">,
  ): Effect.Effect<EntityType<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const value = { ...input, _v: this.schema.latestVersion } as TEntity;
      const db = yield* SqliteDB;

      const { encoded, meta } = yield* this.#encode(value, false);

      yield* db.insert(this.tableName, {
        key: this.#computePrimaryKey(value),
        _data: JSON.stringify(encoded),
        _v: meta._v,
        _u: meta._u,
        _d: 0,
        ...this.#indexColumns(value, meta),
      });

      yield* this.#broadcast({ value, meta });
      return { value, meta };
    });
  }

  update(
    keyValue: Pick<TEntity, TPrimaryKey>,
    updates: Partial<TEntity>,
  ): Effect.Effect<EntityType<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.#getRow(keyValue);
      const value = { ...existing.value, ...updates } as TEntity;

      const { encoded, meta } = yield* this.#encode(value, existing.meta._d);

      yield* db.update(
        this.tableName,
        {
          _data: JSON.stringify(encoded),
          _v: meta._v,
          _u: meta._u,
          ...this.#indexColumns(value, meta),
        },
        Sql.whereEquals(this.#computePrimaryKey(keyValue as TEntity)),
      );

      yield* this.#broadcast({ value, meta });
      return { value, meta };
    });
  }

  delete(
    keyValue: Pick<TEntity, TPrimaryKey>,
  ): Effect.Effect<EntityType<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.#getRow(keyValue);

      yield* db.update(
        this.tableName,
        { _d: 1 },
        Sql.whereEquals(this.#computePrimaryKey(keyValue as TEntity)),
      );

      return { ...existing, meta: { ...existing.meta, _d: true } };
    });
  }

  dangerouslyRemoveAllRows(
    _: "i know what i am doing",
  ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB> {
    return SqliteDB.pipe(Effect.flatMap((db) => db.deleteAll(this.tableName)));
  }

  get(
    keyValue: Pick<TEntity, TPrimaryKey>,
  ): Effect.Effect<EntityType<TEntity>, SqliteDBError, SqliteDB> {
    return this.#getRow(keyValue);
  }

  query<K extends "pk" | (keyof TIndexes & string)>(
    key: K,
    op: QueryKeyOp<TEntity, TPrimaryKey, TIndexes, K>,
    options?: { limit?: number },
  ): Effect.Effect<QueryResult<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const { fields, col } = this.#resolveIndex(key);
      const { operator, value } = extractKeyOp(op);

      const rows = yield* db.query<RawRow>(
        this.tableName,
        Sql.where(col, operator, computeKey(fields, value as WithMeta<TEntity>)),
        { orderBy: getKeyOpOrderDirection(operator), limit: options?.limit ?? 100 },
      );

      return { items: yield* Effect.all(rows.map((r) => this.#parseRow(r))) };
    });
  }

  subscribe<K extends "pk" | (keyof TIndexes & string)>(opts: {
    key: K;
    value?: IndexKeyFields<TEntity, TPrimaryKey, TIndexes, K> | null;
    limit?: number;
  }) {
    return Effect.gen(this, function* () {
      const { fields, col } = this.#resolveIndex(opts.key);
      const db = yield* SqliteDB;
      const service = yield* Option.fromNullable(yield* this.#service);
      const limit = opts.limit ?? 10;

      let cursor = opts.value ?? null;

      while (true) {
        const cursorKey = cursor ? computeKey(fields as (keyof typeof cursor)[], cursor) : "";

        const rows = yield* db.query<RawRow>(
          this.tableName,
          Sql.where(col, ">", cursorKey),
          { orderBy: "ASC", limit },
        );

        const items = yield* Effect.all(rows.map((r) => this.#parseRow(r)));

        if (items.length === 0) {
          service.subscribe(this.schema.name);
          return { success: true };
        }

        service.emit(items);
        const last = items[items.length - 1]!;
        cursor = { ...last.meta, ...last.value } as typeof cursor;
      }
    });
  }

  /**
   * Gets the unified descriptor for this table including schema and index info.
   *
   * @returns The StdDescriptor for this table
   */
  getDescriptor(): StdDescriptor {
    const emptyPk: IndexPatternDescriptor = { deps: [], pattern: "" };

    return {
      name: this.schema.name,
      version: this.schema.latestVersion,
      primaryIndex: {
        name: "primary",
        pk: emptyPk,
        sk: fieldsToPattern(this.primaryKeyFields.map(String)),
      },
      secondaryIndexes: Object.entries(this.indexes).map(([name, index]) => ({
        name,
        pk: emptyPk,
        sk: fieldsToPattern((index as IndexDef<TEntity>).fields.map(String)),
      })),
      schema: this.schema.getDescriptor(),
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #service = Effect.serviceOption(ConnectionService).pipe(Effect.andThen(Option.getOrNull));

  #broadcast(entity: EntityType<TEntity>) {
    return Effect.gen(this, function* () {
      (yield* this.#service)?.broadcast(entity);
    });
  }

  #computePrimaryKey(entity: TEntity): string {
    return computeKey(this.primaryKeyFields, entity);
  }

  #resolveIndex<K extends "pk" | (keyof TIndexes & string)>(
    key: K,
  ): { fields: readonly IndexableFields<TEntity>[]; col: string } {
    if (key === "pk") return { fields: this.primaryKeyFields, col: "key" };
    return { fields: this.indexes[key]!.fields, col: indexKeyColumn(key) };
  }

  #getRow(
    keyValue: Pick<TEntity, TPrimaryKey>,
  ): Effect.Effect<EntityType<TEntity>, SqliteDBError, SqliteDB> {
    return Effect.gen(this, function* () {
      const db = yield* SqliteDB;
      const row = yield* db.get<RawRow>(
        this.tableName,
        Sql.whereEquals(this.#computePrimaryKey(keyValue as TEntity)),
      );
      return yield* this.#parseRow(row);
    });
  }

  #encode(
    value: TEntity,
    deleted: boolean,
  ): Effect.Effect<{ encoded: Record<string, unknown>; meta: RowMeta }, SqliteDBError> {
    return this.schema
      .encode(value as Record<string, unknown>)
      .pipe(Effect.mapError((e) => SqliteDBError.insertFailed(this.tableName, e)))
      .pipe(
        Effect.map((encoded) => ({
          encoded,
          meta: { _e: this.schema.name, _v: encoded._v, _u: new Date().toISOString(), _d: deleted },
        })),
      );
  }

  #parseRow(row: RawRow): Effect.Effect<EntityType<TEntity>, SqliteDBError> {
    return this.schema
      .decode({ ...JSON.parse(row._data), ...metaSchema.make({ _v: row._v }) })
      .pipe(Effect.mapError((e) => SqliteDBError.queryFailed(this.tableName, e)))
      .pipe(
        Effect.map((value) => ({
          value: value as TEntity,
          meta: Schema.decodeSync(sqlMetaSchema)({
            _v: row._v,
            _u: row._u,
            _d: row._d,
            _e: this.schema.name,
          }),
        })),
      );
  }

  #indexColumns(value: TEntity, meta: Pick<RowMeta, "_v" | "_u">): Record<string, string> {
    const combined = { ...value, ...meta } as WithMeta<TEntity>;
    return Object.fromEntries(
      Object.entries(this.indexes).map(([name, def]) => [
        indexKeyColumn(name),
        computeKey((def as IndexDef<TEntity>).fields, combined),
      ]),
    );
  }
}

class SQLiteTableBuilder<
  TSchema extends AnyESchema,
  TEntity = ESchemaType<TSchema>,
  TPrimaryKey extends keyof TEntity = never,
  TIndexes extends Record<string, IndexDef<TEntity>> = {},
> {
  constructor(
    private schema: TSchema,
    private primaryKeyFields: readonly TPrimaryKey[],
    private indexes: TIndexes,
  ) {}

  index<N extends string, K extends IndexableFields<TEntity>>(
    name: N,
    fields: readonly K[],
  ): SQLiteTableBuilder<TSchema, TEntity, TPrimaryKey, TIndexes & { [I in N]: { fields: readonly K[] } }> {
    return new SQLiteTableBuilder(this.schema, this.primaryKeyFields, {
      ...this.indexes,
      [name]: { fields },
    } as TIndexes & { [I in N]: { fields: readonly K[] } });
  }

  build(): SQLiteTable<TSchema, TEntity, TPrimaryKey, TIndexes> {
    return new (SQLiteTable as any)(this.schema, this.primaryKeyFields, this.indexes);
  }
}
