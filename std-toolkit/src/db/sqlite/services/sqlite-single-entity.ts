import type {
  AnySingleEntityESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { Effect, Option, Schema } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { SQLiteTableInstance } from './sqlite-table.js';
import type { SqliteEntityOp, SqliteWriteOp } from './sqlite-entity.js';
import { SqliteDB, SqliteDBError } from '../sql/db.js';
import * as Sql from '../sql/helpers/index.js';
import { Broadcaster, nextUlid } from '../../../core/index.js';
import { deriveIndexKeyValue, type RawRow } from '../internal/utils.js';
import type { TableEntitySnapshotSource } from '../../../snapshot/index.js';
import {
  tableSnapshotSource,
  singletonSnapshotSource,
} from '../../../snapshot/internal/table-snapshot.js';

/**
 * Schema for single entity metadata stored with each item.
 * No `_d` field — single entities have no soft delete concept.
 */
const singleMetaSchema = Schema.Struct({
  /** Entity name */
  _e: Schema.String,
  /** Schema version */
  _v: Schema.String,
  /** Monotonic ULID that changes on every write */
  _u: Schema.String,
});

/**
 * Type for single entity metadata.
 */
export type SingleMetaType = typeof singleMetaSchema.Type;

/**
 * Represents a single entity item with its value and metadata.
 *
 * @typeParam T - The entity value type
 */
export interface SingleEntityType<T> {
  /** The entity data */
  value: T;
  /** Metadata about the entity item */
  meta: SingleMetaType;
}

/**
 * A simplified SQLite entity for single-record use cases (e.g., app config, feature flags, counters).
 * Provides type-safe `get`, `put`, and `getAndUpdate` with a mandatory default value so `get` never returns null.
 *
 * PK and SK are both derived from the entity name only.
 *
 * @typeParam TTable - The SQLiteTable instance type
 * @typeParam TSchema - The ESchema type for this entity
 */
export class SQLiteSingleEntity<
  TTable extends SQLiteTableInstance,
  TSchema extends AnySingleEntityESchema,
> {
  /**
   * Creates a new single entity builder for the given table.
   *
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends SQLiteTableInstance>(
    table: TTable,
    onBuild?: (entity: SQLiteSingleEntity<any, any>) => void,
  ) {
    return {
      /**
       * Configures the entity to use the given ESchema.
       *
       * @param eschema - The ESchema instance
       * @returns A builder to set the default value
       */
      eschema<TS extends AnySingleEntityESchema>(eschema: TS) {
        return {
          /**
           * Sets the default value and constructs the instance.
           * The default is returned by `get` when the item doesn't exist.
           *
           * @param defaultValue - The default entity value
           * @returns The configured SQLiteSingleEntity instance
           */
          default(defaultValue: Omit<ESchemaType<TS>, '_v'>) {
            const entity = new SQLiteSingleEntity<TTable, TS>(
              table,
              eschema,
              defaultValue as ESchemaType<TS>,
            );
            onBuild?.(entity);
            return entity;
          },
        };
      },
    };
  }

  #table: TTable;
  #eschema: TSchema;
  #defaultValue: ESchemaType<TSchema>;

  constructor(
    table: TTable,
    eschema: TSchema,
    defaultValue: ESchemaType<TSchema>,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#defaultValue = defaultValue;
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  [tableSnapshotSource](): TableEntitySnapshotSource {
    return singletonSnapshotSource(this.#eschema);
  }

  #deriveKey(): { pk: string; sk: string } {
    const key = deriveIndexKeyValue(this.#eschema.name, [], {}, true);
    return { pk: key, sk: key };
  }

  /**
   * Retrieves the single entity.
   * Never returns null — returns the default value with synthetic meta if the item doesn't exist.
   *
   * @returns The entity, guaranteed non-null
   */
  get(): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen({ self: this }, function* () {
      const { pk, sk } = this.#deriveKey();

      const { Item } = yield* this.#table.getItem({ pk, sk });

      if (!Item) {
        return {
          value: this.#defaultValue,
          meta: {
            _e: this.#eschema.name,
            _v: this.#eschema.latestVersion,
            _u: '',
          },
        };
      }

      return yield* this.#parseRow(Item);
    }).pipe(
      Effect.withSpan('sqlite.single-entity.get', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Unconditionally writes the entity (upsert).
   *
   * @param value - The entity value to write
   * @returns The written entity with metadata
   */
  put(
    value: Omit<ESchemaType<TSchema>, '_v'>,
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen({ self: this }, function* () {
      const db = yield* SqliteDB;
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(
          Effect.mapError((e) => SqliteDBError.insertFailed(db.tableName, e)),
        );

      const _u = yield* nextUlid;

      const meta: SingleMetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u,
      };
      const { pk, sk } = this.#deriveKey();

      const existing = yield* this.#table.getItem({ pk, sk });

      if (existing.Item) {
        yield* this.#table.updateItem(
          { pk, sk },
          {
            _data: JSON.stringify(encoded),
            _v: this.#eschema.latestVersion,
            _u,
          },
        );
      } else {
        yield* this.#table.putItem({
          pk,
          sk,
          _data: JSON.stringify(encoded),
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: 0,
        });
      }

      const entity = { value: fullValue, meta: { ...meta, _d: false } };
      yield* this.#broadcast([entity]);
      return { value: fullValue, meta };
    }).pipe(
      Effect.withSpan('sqlite.single-entity.put', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * The portable read-modify-write: reads the current entity (the schema
   * default when nothing is stored), derives a partial from it, and writes
   * the merged record back guarded on the `_u` that was read — or on
   * "record does not exist yet" when the read saw the default. Retries up to
   * `retries` times (default 3) on conflict before failing with
   * `conditionFailed`. A callback returning `null` skips the write.
   * `lastWriteWins: true` drops the guard.
   *
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Retry count and guard opt-out
   * @returns The updated entity with new metadata
   */
  getAndUpdate(
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          current: ESchemaType<TSchema>,
        ) => Partial<Omit<ESchemaType<TSchema>, '_v'>> | null),
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen({ self: this }, function* () {
      const db = yield* SqliteDB;
      const retries = config?.retries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const existing = yield* this.get();

        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;

        const fullValue = {
          ...existing.value,
          ...partial,
        } as ESchemaType<TSchema>;

        const encoded = yield* this.#eschema
          .encode(fullValue as any)
          .pipe(
            Effect.mapError((e) => SqliteDBError.updateFailed(db.tableName, e)),
          );

        const _u = yield* nextUlid;

        const meta: SingleMetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
        };
        const { pk, sk } = this.#deriveKey();

        if (existing.meta._u === '') {
          const inserted = yield* this.#table
            .putItem({
              pk,
              sk,
              _data: JSON.stringify(encoded),
              _e: this.#eschema.name,
              _v: this.#eschema.latestVersion,
              _u,
              _d: 0,
            })
            .pipe(
              Effect.as(true),
              Effect.catch((error) =>
                this.#table.getItem({ pk, sk }).pipe(
                  Effect.map(({ Item }) => Item !== null),
                  Effect.catch(() => Effect.succeed(false)),
                  Effect.flatMap((concurrentlyInserted) =>
                    concurrentlyInserted
                      ? Effect.succeed(false)
                      : Effect.fail(error),
                  ),
                ),
              ),
            );
          if (!inserted) {
            if (attempt < retries) continue;
            return yield* Effect.fail(
              SqliteDBError.conditionFailed(db.tableName, { pk, sk }),
            );
          }
        } else {
          const updateValues: Record<string, unknown> = {
            _data: JSON.stringify(encoded),
            _v: this.#eschema.latestVersion,
            _u,
          };

          if (config?.lastWriteWins) {
            yield* this.#table.updateItem({ pk, sk }, updateValues);
          } else {
            const where = Sql.whereAnd(
              Sql.wherePkSkExact(
                this.#table.primary.pk,
                this.#table.primary.sk,
                pk,
                sk,
              ),
              Sql.where('_u', '=', existing.meta._u),
            );
            const { rowsWritten } = yield* db.update(
              db.tableName,
              updateValues,
              where,
            );
            if (rowsWritten === 0) {
              if (attempt < retries) continue;
              return yield* Effect.fail(
                SqliteDBError.conditionFailed(db.tableName, { pk, sk }),
              );
            }
          }
        }

        const entity = { value: fullValue, meta: { ...meta, _d: false } };
        yield* this.#broadcast([entity]);
        return { value: fullValue, meta };
      }
    }).pipe(
      Effect.withSpan('sqlite.single-entity.get-and-update', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /** Writes the default value back — single entities are never deleted. */
  reset(): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return this.put(this.#defaultValue).pipe(
      Effect.withSpan('sqlite.single-entity.reset', {
        attributes: { entity: this.#eschema.name },
      }),
    );
  }

  /**
   * Validates and encodes NOW (no write), pre-fetching the existing entity so
   * the returned op embeds the optimistic `expectedU` check. The final cursor
   * and broadcast metadata are assigned when applied. Fails if the item
   * doesn't exist (i.e., `_u === ""`).
   *
   * @param update - Partial entity, or a callback deriving one from the current value
   * @param config - Guard opt-out
   * @returns A descriptor for update, plus its broadcast payload
   */
  getAndUpdateOp(
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          current: ESchemaType<TSchema>,
        ) => Partial<Omit<ESchemaType<TSchema>, '_v'>>),
    config?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB> {
    return Effect.gen({ self: this }, function* () {
      const db = yield* SqliteDB;
      const existing = yield* this.get();

      if (existing.meta._u === '') {
        return yield* Effect.fail(SqliteDBError.noItemToUpdate(db.tableName));
      }

      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(
          Effect.mapError((e) => SqliteDBError.updateFailed(db.tableName, e)),
        );

      const { pk, sk } = this.#deriveKey();

      return {
        entityName: this.#eschema.name,
        operationKind: 'updateOp',
        pk,
        sk,
        table: this.#table,
        apply: (u) => ({
          write: {
            type: 'update',
            key: { pk, sk },
            values: {
              _data: JSON.stringify(encoded),
              _v: this.#eschema.latestVersion,
              _u: u,
            },
            ...(config?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
          } satisfies SqliteWriteOp,
          entity: {
            value: fullValue,
            meta: {
              _e: this.#eschema.name,
              _v: this.#eschema.latestVersion,
              _u: u,
              _d: false,
            },
          },
        }),
      };
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #broadcast(entities: EntityType<ESchemaType<TSchema>>[]) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entities);
    });
  }

  #parseRow(
    row: RawRow,
  ): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.flatMap(SqliteDB, (db) =>
      this.#eschema
        .decode({ ...JSON.parse(row._data), _v: row._v })
        .pipe(
          Effect.mapError((e) => SqliteDBError.queryFailed(db.tableName, e)),
        ),
    ).pipe(
      Effect.map((value) => ({
        value: value as ESchemaType<TSchema>,
        meta: Schema.decodeUnknownSync(singleMetaSchema)({
          _e: row._e ?? this.#eschema.name,
          _v: row._v,
          _u: row._u,
        }),
      })),
    );
  }
}
