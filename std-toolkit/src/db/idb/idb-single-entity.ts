import type {
  AnySingleEntityESchema,
  ESchemaType,
} from '../../eschema/index.js';
import { Effect, Option } from 'effect';
import type { EntityType, SingleEntityType } from '../../core/index.js';
import { Broadcaster, nextUlid } from '../../core/index.js';
import type { IdbTableInstance } from './idb-table.js';
import { IdbDB, IdbDBError } from './db.js';
import type { IdbRecord } from './db.js';
import { deriveIndexKeyValue } from './internal/utils.js';

/**
 * A simplified IndexedDB entity for single-record use cases (e.g., app
 * config, feature flags, counters). Provides type-safe `get`, `put`, and
 * `update` with a mandatory default value so `get` never returns null.
 *
 * PK and SK are both derived from the entity name only. Mirrors
 * `SQLiteSingleEntity`'s surface.
 *
 * @typeParam TTable - The IdbTable instance type
 * @typeParam TSchema - The ESchema type for this entity
 */
export class IdbSingleEntity<
  TTable extends IdbTableInstance,
  TSchema extends AnySingleEntityESchema,
> {
  /**
   * Creates a new single entity builder for the given table.
   *
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends IdbTableInstance>(table: TTable) {
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
           * @returns The configured IdbSingleEntity instance
           */
          default(defaultValue: Omit<ESchemaType<TS>, '_v'>) {
            return new IdbSingleEntity<TTable, TS>(
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
    IdbDBError,
    IdbDB
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
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const db = yield* IdbDB;
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => IdbDBError.putFailed(db.tableName, e)));

      const _u = yield* nextUlid;

      const meta = {
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
            _data: encoded,
            _v: this.#eschema.latestVersion,
            _u,
          },
        );
      } else {
        const record: IdbRecord = {
          pk,
          sk,
          _data: encoded,
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: false,
        };
        yield* this.#table.putItem(record);
      }

      yield* this.#broadcast({
        value: fullValue,
        meta: { ...meta, _d: false },
      });
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
  }): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const db = yield* IdbDB;
      const existing = yield* this.get();

      if (existing.meta._u === '') {
        return yield* Effect.fail(IdbDBError.noItemToUpdate(db.tableName));
      }

      const fullValue = {
        ...existing.value,
        ...params.update,
      } as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => IdbDBError.putFailed(db.tableName, e)));

      const _u = yield* nextUlid;

      const meta = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u,
      };

      const { pk, sk } = this.#deriveKey();

      yield* this.#table.updateItem(
        { pk, sk },
        {
          _data: encoded,
          _v: this.#eschema.latestVersion,
          _u,
        },
        existing.meta._u,
      );

      yield* this.#broadcast({
        value: fullValue,
        meta: { ...meta, _d: false },
      });
      return { value: fullValue, meta };
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  #broadcast(entity: EntityType<ESchemaType<TSchema>>) {
    return Effect.gen(function* () {
      const service = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );
      service?.broadcast(entity);
    });
  }

  #parseRow(
    row: IdbRecord,
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.flatMap(IdbDB, (db) =>
      this.#eschema
        .decode({ ...row._data, _v: row._v })
        .pipe(Effect.mapError((e) => IdbDBError.getFailed(db.tableName, e))),
    ).pipe(
      Effect.map((value) => ({
        value: value as ESchemaType<TSchema>,
        meta: {
          _e: row._e ?? this.#eschema.name,
          _v: row._v,
          _u: row._u,
        },
      })),
    );
  }
}
