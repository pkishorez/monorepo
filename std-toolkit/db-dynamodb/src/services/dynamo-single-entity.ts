import type { AnySingleEntityESchema, ESchemaType } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import type { DynamoTable } from './dynamo-table.js';
import type { DynamoDB } from './dynamo-client.js';
import { DynamodbError } from '../errors.js';
import {
  deriveIndexKeyValue,
  sameValue,
  isConditionalCheckFailed,
} from '../internal/index.js';
import { buildExpr, type UpdateExprResult } from '../expr/build-expr.js';
import {
  exprCondition,
  resolveCondition,
  type ConditionOperation,
  type ConditionInput,
} from '../expr/condition.js';
import {
  exprUpdate,
  type UpdateOps,
  type AnyOperation,
} from '../expr/update.js';
import type { TransactItem } from '../types/index.js';
import type { MigrationInspection } from '../types/migration.js';

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
type SingleMetaType = typeof singleMetaSchema.Type;

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

type SingleEntityCanonicalMigrationIntent = {
  item: Record<string, unknown>;
};

const migrationRowsMatch = (
  stored: Record<string, unknown>,
  canonical: Record<string, unknown>,
): boolean => {
  const { _u: _s, ...storedStable } = stored;
  const { _u: _c, ...canonicalStable } = canonical;
  return sameValue(storedStable, canonicalStable);
};

/**
 * A simplified DynamoDB entity for single-record use cases (e.g., app config, feature flags, counters).
 * Provides type-safe `get`, `put`, and `update` with a mandatory default value so `get` never returns null.
 *
 * PK is always the entity name. SK is always the idField value.
 *
 * @typeParam TTable - The DynamoTable instance type
 * @typeParam TSchema - The ESchema type for this entity
 */
export class DynamoSingleEntity<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnySingleEntityESchema,
> {
  /**
   * Creates a new single entity builder for the given table.
   *
   * @returns A builder to configure the entity schema
   */
  static make<TTable extends DynamoTable<any, any>>(table: TTable) {
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
           * The default is returned by `get` when the item doesn't exist in DynamoDB.
           *
           * @param defaultValue - The default entity value
           * @returns The configured DynamoSingleEntity instance
           */
          default(defaultValue: Omit<ESchemaType<TS>, '_v'>) {
            return new DynamoSingleEntity<TTable, TS>(
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
    this.#defaultValue = defaultValue as ESchemaType<TSchema>;
  }

  /**
   * Gets the entity name from the schema.
   */
  get name(): TSchema['name'] {
    return this.#eschema.name;
  }

  inspectMigration(
    rawItem: Record<string, unknown>,
  ): Effect.Effect<MigrationInspection, never> {
    return this.#canonicalMigrationIntent(rawItem).pipe(
      Effect.map(({ item }): MigrationInspection => {
        const storedKey = {
          pk: rawItem[this.#table.primary.pk],
          sk: rawItem[this.#table.primary.sk],
        };
        const canonicalKey = {
          pk: item[this.#table.primary.pk],
          sk: item[this.#table.primary.sk],
        };

        if (
          storedKey.pk !== canonicalKey.pk ||
          storedKey.sk !== canonicalKey.sk
        ) {
          return {
            entity: this.#eschema.name,
            state: { type: 'primaryKeyChanged' },
            reasons: ['primaryKeyChanged'],
          };
        }

        if (!migrationRowsMatch(rawItem, item)) {
          return {
            entity: this.#eschema.name,
            state: { type: 'stale', data: true, indexes: false },
            reasons: ['staleData'],
          };
        }

        return {
          entity: this.#eschema.name,
          state: { type: 'valid' },
          reasons: [],
        };
      }),
      Effect.catch((err): Effect.Effect<MigrationInspection, never> => {
        const causeMessage =
          err instanceof Error
            ? err.message
            : err &&
                typeof err === 'object' &&
                'cause' in err &&
                err.cause instanceof Error
              ? err.cause.message
              : undefined;
        return Effect.succeed({
          entity: this.#eschema.name,
          state: { type: 'corrupt' },
          reasons: ['corrupt', ...(causeMessage ? [causeMessage] : [])],
        });
      }),
    );
  }

  migrationWriteIntent(
    rawItem: Record<string, unknown>,
  ): Effect.Effect<SingleEntityCanonicalMigrationIntent | undefined, never> {
    return this.#canonicalMigrationIntent(
      rawItem,
      new Date().toISOString(),
    ).pipe(
      Effect.map(
        ({ item }): SingleEntityCanonicalMigrationIntent | undefined => {
          const storedPk = rawItem[this.#table.primary.pk];
          const storedSk = rawItem[this.#table.primary.sk];
          const canonicalPk = item[this.#table.primary.pk];
          const canonicalSk = item[this.#table.primary.sk];
          if (storedPk !== canonicalPk || storedSk !== canonicalSk)
            return undefined;
          if (migrationRowsMatch(rawItem, item)) return undefined;
          return { item };
        },
      ),
      Effect.catch(() => Effect.succeed(undefined)),
    );
  }

  #derivePrimaryKey(): string {
    return deriveIndexKeyValue(this.#eschema.name, [], {}, true);
  }

  #canonicalMigrationIntent(
    rawItem: Record<string, unknown>,
    updateTimestamp?: string,
  ): Effect.Effect<SingleEntityCanonicalMigrationIntent, unknown> {
    return Effect.gen({ self: this }, function* () {
      if (typeof rawItem._u !== 'string') {
        return yield* Effect.fail('missingUpdateTimestamp');
      }

      const value = yield* this.#eschema.decode(rawItem);
      const encoded = yield* this.#eschema.encode(value as any);

      const item = {
        ...encoded,
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u: updateTimestamp ?? rawItem._u,
        [this.#table.primary.pk]: this.#derivePrimaryKey(),
        [this.#table.primary.sk]: this.#derivePrimaryKey(),
      };

      return { item };
    });
  }

  /**
   * Retrieves the single entity.
   * Never returns null — returns the default value with synthetic meta if the item doesn't exist.
   *
   * @param options - Optional read options
   * @returns The entity, guaranteed non-null
   */
  get(options?: {
    ConsistentRead?: boolean;
  }): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamodbError,
    DynamoDB
  > {
    return Effect.gen({ self: this }, function* () {
      const pk = this.#derivePrimaryKey();
      const sk = this.#derivePrimaryKey();

      const { Item } = yield* this.#table.getItem({ pk, sk }, options);

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

      const value = yield* this.#eschema
        .decode(Item)
        .pipe(Effect.mapError((e) => DynamodbError.getItemFailed(e)));

      const meta = Schema.decodeUnknownSync(singleMetaSchema)(Item);

      return {
        value: value as ESchemaType<TSchema>,
        meta,
      };
    }).pipe(
      Effect.tapError((e) =>
        Effect.logError(`[${this.#eschema.name}] get failed`, { error: e }),
      ),
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
    DynamodbError,
    DynamoDB
  > {
    return Effect.gen({ self: this }, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as unknown as ESchemaType<TSchema>;

      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const _u = new Date().toISOString();

      const meta: SingleMetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u,
      };

      const pk = this.#derivePrimaryKey();
      const sk = this.#derivePrimaryKey();

      const item = {
        ...encoded,
        ...meta,
        [this.#table.primary.pk]: pk,
        [this.#table.primary.sk]: sk,
      };

      yield* this.#table.putItem(item);

      return { value: fullValue, meta };
    }).pipe(
      Effect.tapError((e) =>
        Effect.logError(`[${this.#eschema.name}] put failed`, { error: e }),
      ),
    );
  }

  /**
   * Updates the single entity.
   * Fails with `NoItemToUpdate` if the item doesn't exist.
   * Accepts either a plain partial object or an expression builder callback.
   *
   * @param params - Object containing the update and optional condition
   * @returns The updated entity with new metadata
   */
  update(params: {
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          ops: UpdateOps<ESchemaType<TSchema>>,
        ) => AnyOperation<ESchemaType<TSchema>>[]);
    condition?: ConditionInput<ESchemaType<TSchema>>;
  }): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    DynamodbError,
    DynamoDB
  > {
    const { update: updates, condition } = params;
    return Effect.gen({ self: this }, function* () {
      const { pk, sk, exprResult } =
        typeof updates === 'function'
          ? this.#prepareUpdateExpr(updates, condition)
          : this.#prepareUpdate(updates, condition);

      const result = yield* this.#table
        .updateItem({ pk, sk }, { ReturnValues: 'ALL_NEW', ...exprResult })
        .pipe(
          Effect.mapError(
            (e): DynamodbError =>
              e.error._tag === 'UpdateItemFailed' && isConditionalCheckFailed(e)
                ? condition
                  ? DynamodbError.conditionCheckFailed()
                  : DynamodbError.noItemToUpdate()
                : e,
          ),
        );

      if (!result.Attributes) {
        return yield* Effect.fail(DynamodbError.noItemToUpdate());
      }

      const decodedValue = yield* this.#eschema
        .decode(result.Attributes)
        .pipe(Effect.mapError((e) => DynamodbError.updateItemFailed(e)));

      const updatedMeta = Schema.decodeUnknownSync(singleMetaSchema)(
        result.Attributes,
      );

      return {
        value: decodedValue as ESchemaType<TSchema>,
        meta: updatedMeta,
      };
    }).pipe(
      Effect.tapError((e) =>
        Effect.logError(`[${this.#eschema.name}] update failed`, { error: e }),
      ),
    );
  }

  /**
   * Creates an update operation for use in a transaction.
   * Pre-fetches the existing entity to include complete broadcast data.
   *
   * @param params - Object containing the update and optional condition
   * @returns A transaction item for update with broadcast data
   */
  updateOp(params: {
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          ops: UpdateOps<ESchemaType<TSchema>>,
        ) => AnyOperation<ESchemaType<TSchema>>[]);
    condition?: ConditionInput<ESchemaType<TSchema>>;
  }): Effect.Effect<TransactItem<TSchema['name']>, DynamodbError, DynamoDB> {
    const { update: updates, condition } = params;
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.get();

      const { pk, sk, exprResult } =
        typeof updates === 'function'
          ? this.#prepareUpdateExpr(updates, condition)
          : this.#prepareUpdate(updates, condition);

      const mergedValue =
        typeof updates === 'function'
          ? existing.value
          : ({ ...existing.value, ...updates } as ESchemaType<TSchema>);

      const tableOp = this.#table.opUpdateItem({ pk, sk }, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
        broadcast: {
          value: mergedValue,
          meta: { ...existing.meta, _d: false },
        },
      };
    });
  }

  /**
   * Hard-deletes the entity record from DynamoDB.
   * Subsequent `get` calls will return the default value.
   */
  delete(): Effect.Effect<void, DynamodbError, DynamoDB> {
    return Effect.gen({ self: this }, function* () {
      const pk = this.#derivePrimaryKey();
      const sk = this.#derivePrimaryKey();
      yield* this.#table.deleteItem({ pk, sk });
    }).pipe(
      Effect.tapError((e) =>
        Effect.logError(`[${this.#eschema.name}] delete failed`, { error: e }),
      ),
    );
  }

  #buildUpdateCondition(
    userCondition?: ConditionInput<ESchemaType<TSchema>>,
  ): ConditionOperation {
    const ops: ConditionOperation[] = [
      exprCondition(($) =>
        $.cond('_v' as any, '=', this.#eschema.latestVersion),
      ),
    ];
    if (userCondition) ops.push(resolveCondition(userCondition));
    return exprCondition(($) => $.and(...ops));
  }

  #prepareUpdate(
    updates: Partial<Omit<ESchemaType<TSchema>, '_v'>>,
    condition?: ConditionInput<ESchemaType<TSchema>>,
  ): { pk: string; sk: string; exprResult: UpdateExprResult } {
    const pk = this.#derivePrimaryKey();
    const sk = this.#derivePrimaryKey();

    const _u = new Date().toISOString();

    const builtCondition = this.#buildUpdateCondition(condition);

    const update = exprUpdate<any>(($) => [
      ...Object.entries(updates).map(([key, v]) => $.set(key, v)),
      $.set('_u', _u),
    ]);

    const exprResult = buildExpr({
      update,
      condition: builtCondition,
    });

    return { pk, sk, exprResult };
  }

  #prepareUpdateExpr(
    builder: (ops: UpdateOps<any>) => AnyOperation<any>[],
    condition?: ConditionInput<ESchemaType<TSchema>>,
  ): { pk: string; sk: string; exprResult: UpdateExprResult } {
    const pk = this.#derivePrimaryKey();
    const sk = this.#derivePrimaryKey();

    const userOps = exprUpdate<any>(builder);
    const _u = new Date().toISOString();

    const builtCondition = this.#buildUpdateCondition(condition);

    const update = exprUpdate<any>(($) => [...userOps, $.set('_u', _u)]);

    const exprResult = buildExpr({
      update,
      condition: builtCondition,
    });

    return { pk, sk, exprResult };
  }
}
