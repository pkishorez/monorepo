import type { AnySingleEntityESchema, ESchemaType } from '@std-toolkit/eschema';
import { Effect, FiberRef, Option, Schema } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { SQLiteTableInstance } from './sqlite-table.js';
import { SqliteDBError, TransactionPendingBroadcasts } from '../sql/db.js';
import type { SqliteDB } from '../sql/db.js';
import { ConnectionService } from '@std-toolkit/core/server';
import { deriveIndexKeyValue, type RawRow } from '../internal/utils.js';

/**
 * Schema for single entity metadata stored with each item.
 * No `_d` field — single entities have no soft delete concept.
 */
const singleMetaSchema = Schema.Struct({
  /** Entity name */
  _e: Schema.String,
  /** Schema version */
  _v: Schema.String,
  /** ISO timestamp that changes on every write */
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
 * Provides type-safe `get`, `put`, and `update` with a mandatory default value so `get` never returns null.
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
  static make<TTable extends SQLiteTableInstance>(table: TTable) {
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
            return new SQLiteSingleEntity<TTable, TS>(
              table,
              eschema,
              defaultValue as ESchemaType<TS>,
            );
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
    return Effect.gen(this, function* () {
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
    });
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
    return Effect.gen(this, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(
          Effect.mapError((e) =>
            SqliteDBError.insertFailed(this.#table.tableName, e),
          ),
        );

      const _u = new Date().toISOString();

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
      yield* this.#broadcast(entity);
      return { value: fullValue, meta };
    });
  }

  /**
   * Updates the single entity with a plain object partial merge.
   * Fails if the item doesn't exist (i.e., `_u === ""`).
   *
   * @param params - Object containing the update
   * @returns The updated entity with new metadata
   */
  update(params: {
    update: Partial<Omit<ESchemaType<TSchema>, '_v'>>;
  }): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    SqliteDBError,
    SqliteDB
  > {
    return Effect.gen(this, function* () {
      const existing = yield* this.get();

      if (existing.meta._u === '') {
        return yield* Effect.fail(
          SqliteDBError.updateFailed(this.#table.tableName, 'Item not found'),
        );
      }

      const fullValue = {
        ...existing.value,
        ...params.update,
      } as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(
          Effect.mapError((e) =>
            SqliteDBError.updateFailed(this.#table.tableName, e),
          ),
        );

      const _u = new Date().toISOString();

      const meta: SingleMetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u,
      };

      const { pk, sk } = this.#deriveKey();

      const updateValues: Record<string, unknown> = {
        _data: JSON.stringify(encoded),
        _v: this.#eschema.latestVersion,
        _u,
      };

      yield* this.#table.updateItem({ pk, sk }, updateValues);

      const entity = { value: fullValue, meta: { ...meta, _d: false } };
      yield* this.#broadcast(entity);
      return { value: fullValue, meta };
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #service = Effect.serviceOption(ConnectionService).pipe(
    Effect.andThen(Option.getOrNull),
  );

  #broadcast(entity: EntityType<ESchemaType<TSchema>>) {
    return Effect.gen(this, function* () {
      const pending = yield* FiberRef.get(TransactionPendingBroadcasts);
      if (Option.isSome(pending)) {
        yield* FiberRef.set(
          TransactionPendingBroadcasts,
          Option.some([...pending.value, entity]),
        );
      } else {
        (yield* this.#service)?.broadcast(entity);
      }
    });
  }

  #parseRow(
    row: RawRow,
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, SqliteDBError> {
    return this.#eschema
      .decode({ ...JSON.parse(row._data), _v: row._v })
      .pipe(
        Effect.mapError((e) =>
          SqliteDBError.queryFailed(this.#table.tableName, e),
        ),
      )
      .pipe(
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
