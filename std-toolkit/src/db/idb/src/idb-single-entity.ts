import type {
  AnySingleEntityESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { Effect, Option } from 'effect';
import type { EntityType, SingleEntityType } from '../../../core/index.js';
import { Broadcaster, nextUlid } from '../../../core/index.js';
import type { IdbTableInstance } from './idb-table.js';
import type { IdbEntityOp } from './idb-entity.js';
import { IdbDB, IdbDBError } from './db.js';
import type { IdbRecord, IdbWriteOp } from './db.js';
import { deriveIndexKeyValue } from './internal/utils.js';

/**
 * A simplified IndexedDB entity for single-record use cases (e.g., app
 * config, feature flags, counters). Provides type-safe `get`, `put`, and
 * `getAndUpdate` with a mandatory default value so `get` never returns null.
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
  static make<TTable extends IdbTableInstance>(
    table: TTable,
    onBuild?: (entity: IdbSingleEntity<any, any>) => void,
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
           * @returns The configured IdbSingleEntity instance
           */
          default(defaultValue: Omit<ESchemaType<TS>, '_v'>) {
            const entity = new IdbSingleEntity<TTable, TS>(
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

      yield* this.#broadcast([
        {
          value: fullValue,
          meta: { ...meta, _d: false },
        },
      ]);
      return { value: fullValue, meta };
    });
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
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const db = yield* IdbDB;
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
          .pipe(Effect.mapError((e) => IdbDBError.putFailed(db.tableName, e)));

        const _u = yield* nextUlid;

        const meta = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
        };

        const { pk, sk } = this.#deriveKey();

        const write: IdbWriteOp =
          existing.meta._u === ''
            ? {
                type: 'put',
                record: {
                  pk,
                  sk,
                  _data: encoded,
                  _e: this.#eschema.name,
                  _v: this.#eschema.latestVersion,
                  _u,
                  _d: false,
                },
                ...(config?.lastWriteWins ? {} : { expectedU: null }),
              }
            : {
                type: 'patch',
                key: { pk, sk },
                values: {
                  _data: encoded,
                  _v: this.#eschema.latestVersion,
                  _u,
                },
                ...(config?.lastWriteWins
                  ? {}
                  : { expectedU: existing.meta._u }),
              };

        const conflicted = yield* db.transact([write]).pipe(
          Effect.as(false),
          Effect.catchIf(
            (e) => e.code === 'conditionFailed',
            () => Effect.succeed(true),
          ),
        );
        if (conflicted) {
          if (attempt < retries) continue;
          return yield* Effect.fail(
            IdbDBError.conditionFailed(db.tableName, { pk, sk }),
          );
        }

        yield* this.#broadcast([
          {
            value: fullValue,
            meta: { ...meta, _d: false },
          },
        ]);
        return { value: fullValue, meta };
      }
    });
  }

  /** Writes the default value back — single entities are never deleted. */
  reset(): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    IdbDBError,
    IdbDB
  > {
    return this.put(this.#defaultValue);
  }

  /**
   * Validates and encodes NOW (no write), pre-fetching the existing entity so
   * the returned op embeds the optimistic `expectedU` check and complete
   * broadcast data. Fails if the item doesn't exist (i.e., `_u === ""`).
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
  ): Effect.Effect<IdbEntityOp, IdbDBError, IdbDB> {
    return Effect.gen({ self: this }, function* () {
      const db = yield* IdbDB;
      const existing = yield* this.get();

      if (existing.meta._u === '') {
        return yield* Effect.fail(IdbDBError.noItemToUpdate(db.tableName));
      }

      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => IdbDBError.putFailed(db.tableName, e)));

      const key = this.#deriveKey();

      return {
        entityName: this.#eschema.name,
        operationKind: 'updateOp',
        pk: key.pk,
        sk: key.sk,
        table: this.#table,
        apply: (u) => ({
          write: {
            type: 'patch',
            key,
            values: {
              _data: encoded,
              _v: this.#eschema.latestVersion,
              _u: u,
            },
            ...(config?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
          } satisfies IdbWriteOp,
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
