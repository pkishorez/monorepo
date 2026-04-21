import type { AnySingleEntityESchema, ESchemaType } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import type { DynamoTable } from './dynamo-table.js';
import { DynamodbError } from '../errors.js';
import { deriveIndexKeyValue } from '../internal/index.js';
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

/**
 * Checks if an error is a conditional check failure from DynamoDB.
 */
const isConditionalCheckFailed = (e: DynamodbError): boolean => {
  if (!('cause' in e.error)) return false;
  const cause = e.error.cause as DynamodbError | undefined;
  return (
    cause?.error._tag === 'UnknownAwsError' &&
    cause.error.name === 'ConditionalCheckFailedException'
  );
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

  #derivePk(): string {
    return deriveIndexKeyValue(this.#eschema.name, [], {}, true);
  }

  #deriveSk(): string {
    return deriveIndexKeyValue(this.#eschema.name, [], {}, true);
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
  }): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, DynamodbError> {
    return Effect.gen(this, function* () {
      const pk = this.#derivePk();
      const sk = this.#deriveSk();

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
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, DynamodbError> {
    return Effect.gen(this, function* () {
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

      const pk = this.#derivePk();
      const sk = this.#deriveSk();

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
  }): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    const { update: updates, condition } = params;
    return Effect.gen(function* () {
      const { pk, sk, exprResult } =
        typeof updates === 'function'
          ? self.#prepareUpdateExpr(updates, condition)
          : self.#prepareUpdate(updates, condition);

      const result = yield* self.#table
        .updateItem({ pk, sk }, { ReturnValues: 'ALL_NEW', ...exprResult })
        .pipe(
          Effect.mapError(
            (e): DynamodbError =>
              e.error._tag === 'UpdateItemFailed' && isConditionalCheckFailed(e)
                ? DynamodbError.noItemToUpdate()
                : e,
          ),
        );

      if (!result.Attributes) {
        return yield* Effect.fail(DynamodbError.noItemToUpdate());
      }

      const decodedValue = yield* self.#eschema
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
  }): Effect.Effect<TransactItem<TSchema['name']>, DynamodbError> {
    const { update: updates, condition } = params;
    return Effect.gen(this, function* () {
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
    const pk = this.#derivePk();
    const sk = this.#deriveSk();

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
    const pk = this.#derivePk();
    const sk = this.#deriveSk();

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
