import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import { Effect, Schema, Struct, Match } from 'effect';

import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { DynamoDB } from '../../dynamodb/index.js';
import { nextUlid } from '../../../../../core/index.js';
import {
  DynamoDBError,
  extractConditionFailureItem,
  isConditionalCheckFailed,
} from '../../../domain/dynamodb-error/index.js';
import {
  deriveIndexKeyValue,
  makeEntityMetadata,
  migrationOutcome,
} from '../../../domain/entity-persistence/index.js';
import {
  exprCondition,
  exprUpdate,
  resolveCondition,
  type AnyOperation,
  type ConditionExprResult,
  type ConditionInput,
  type ConditionOperation,
  type UpdateExprResult,
  type UpdateOps,
} from '../../../domain/expression/index.js';
import { buildExpr } from '../../../domain/expression/index.js';
import { EntityIndex, type StoredIndexDerivation } from '../entity-index.js';

/**
 * Schema for entity metadata stored with each item.
 */
const metaSchema = Schema.Struct({
  /** Entity name */
  _e: Schema.String,
  /** Schema version */
  _v: Schema.String,
  /** Monotonic ULID that changes on every write */
  _u: Schema.String,
  /** Soft delete flag */
  _d: Schema.Boolean,
});

/**
 * Type for entity metadata.
 */
type MetaType = typeof metaSchema.Type;

/**
 * Extracts root attribute keys from a (possibly nested) array of update operations.
 */
function extractKeysFromOps(
  ops: any[],
  out: Set<string> = new Set(),
): Set<string> {
  for (const op of ops) {
    if (Array.isArray(op)) {
      extractKeysFromOps(op, out);
    } else if (op && typeof op === 'object' && 'key' in op) {
      const key = String(op.key);
      const dot = key.indexOf('.');
      out.add(dot === -1 ? key : key.slice(0, dot));
    }
  }
  return out;
}

export class EntityWritePreparation<
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
> {
  readonly #table: TTable;
  readonly #eschema: TSchema;
  readonly #index: EntityIndex<TSecondaryDerivationMap>;

  constructor(
    table: TTable,
    eschema: TSchema,
    index: EntityIndex<TSecondaryDerivationMap>,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#index = index;
  }

  canonicalizeDecodedValue(
    value: ESchemaType<TSchema>,
    rawItem: Record<string, unknown>,
    updateTimestamp?: string,
  ): Effect.Effect<
    {
      item: Record<string, unknown>;
      key: { pk: string; sk: string };
      semanticItem: Record<string, unknown>;
      indexAttributes: Record<string, unknown>;
    },
    DynamoDBError
  > {
    return Effect.gen({ self: this }, function* () {
      const encoded = yield* this.#eschema
        .encode(value as any)
        .pipe(Effect.mapError((e) => DynamoDBError.putItemFailed(e)));

      const _u = updateTimestamp ?? rawItem._u;
      const meta = makeEntityMetadata(
        this.#eschema.name,
        this.#eschema.latestVersion,
        typeof _u === 'string' ? _u : '',
        typeof rawItem._d === 'boolean' ? rawItem._d : false,
      );
      const valueWithMeta = { ...value, _u: meta._u };
      const primaryIndex = this.#index.primaryKey(valueWithMeta);
      const indexAttributes = this.#index.secondaryAttributes(valueWithMeta);
      const item = {
        ...encoded,
        ...meta,
        [this.#table.primary.pk]: primaryIndex.pk,
        [this.#table.primary.sk]: primaryIndex.sk,
        ...indexAttributes,
      };

      return {
        item,
        key: primaryIndex,
        semanticItem: this.#index.semanticItem(item),
        indexAttributes,
      };
    });
  }

  prepareInsert(
    fullValue: ESchemaType<TSchema>,
    condition?: ConditionInput<ESchemaType<TSchema>>,
  ): Effect.Effect<
    {
      exprResult: ConditionExprResult;
      fullValue: ESchemaType<TSchema>;
      restamp: (u: string) => {
        item: Record<string, unknown>;
        meta: MetaType;
      };
    },
    DynamoDBError
  > {
    return Effect.gen({ self: this }, function* () {
      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamoDBError.putItemFailed(e)));

      const restamp = (_u: string) => {
        const meta = makeEntityMetadata(
          this.#eschema.name,
          this.#eschema.latestVersion,
          _u,
        );

        const valueWithMeta = { ...fullValue, _u };
        const primaryIndex = this.#index.primaryKey(valueWithMeta);
        const indexMap = this.#index.secondaryAttributes(valueWithMeta);

        const item = {
          ...encoded,
          ...meta,
          [this.#table.primary.pk]: primaryIndex.pk,
          [this.#table.primary.sk]: primaryIndex.sk,
          ...indexMap,
        };

        return { item, meta };
      };

      const resolvedCondition = condition
        ? resolveCondition(condition)
        : undefined;

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              resolvedCondition,
              $.attributeNotExists(this.#table.primary.pk as any),
              $.attributeNotExists(this.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

      return { exprResult, fullValue, restamp };
    });
  }

  handleConditionFailure(
    error: DynamoDBError,
    autoMigrate: boolean,
    userCondition?: ConditionInput<ESchemaType<TSchema>>,
  ): Effect.Effect<
    | { Attributes: Record<string, unknown> | null }
    | { _retry: true; Attributes: null },
    DynamoDBError,
    DynamoDB
  > {
    const existingItem = extractConditionFailureItem(error);
    const persistenceOutcome = migrationOutcome(
      existingItem,
      this.#eschema.latestVersion,
    );
    const outcome =
      persistenceOutcome === 'migrate'
        ? autoMigrate
          ? 'migrate'
          : 'stale'
        : persistenceOutcome;

    return Match.value(outcome).pipe(
      Match.when('missing', () =>
        Effect.fail(DynamoDBError.noItemToUpdate(error.cause)),
      ),
      Match.when('current', () =>
        Effect.fail(
          this.#currentConditionError(userCondition !== undefined, error.cause),
        ),
      ),
      Match.when('stale', () =>
        Effect.fail(DynamoDBError.itemVersionMismatch(error.cause)),
      ),
      Match.when('migrate', () =>
        this.#ensureLatestVersion(existingItem!).pipe(
          Effect.map(() => ({ _retry: true as const, Attributes: null })),
        ),
      ),
      Match.exhaustive,
    );
  }

  #ensureLatestVersion(
    rawItem: Record<string, unknown>,
  ): Effect.Effect<void, DynamoDBError, DynamoDB> {
    return Effect.gen({ self: this }, function* () {
      const decoded = yield* this.#eschema
        .decode(rawItem)
        .pipe(Effect.mapError((e) => DynamoDBError.itemMigrationFailed(e)));

      const canonical = yield* this.canonicalizeDecodedValue(
        decoded as ESchemaType<TSchema>,
        rawItem,
        typeof rawItem._u === 'string' ? rawItem._u : yield* nextUlid,
      ).pipe(Effect.mapError((e) => DynamoDBError.itemMigrationFailed(e)));

      const oldVersion = rawItem._v;
      const conditionExpr = buildExpr({
        condition: exprCondition(($) =>
          $.cond('_v' as any, '=', oldVersion as any),
        ),
      });

      yield* this.#table
        .putItem(canonical.item, {
          ...conditionExpr,
        })
        .pipe(
          Effect.catchIf(
            (e): e is DynamoDBError =>
              e._tag === 'PutItemFailed' && isConditionalCheckFailed(e),
            (error) =>
              Effect.fail(DynamoDBError.itemMigrationFailed(error.cause)),
          ),
        );
    });
  }

  #buildUpdateCondition(
    userCondition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
  ): ConditionOperation {
    const ops: ConditionOperation[] = [
      exprCondition(($) =>
        $.cond('_v' as any, '=', this.#eschema.latestVersion),
      ),
    ];
    if (expectedU !== undefined) {
      ops.push(exprCondition(($) => $.cond('_u' as any, '=', expectedU)));
    }
    if (userCondition) ops.push(resolveCondition(userCondition));
    return exprCondition(($) => $.and(...ops));
  }

  #currentConditionError(
    hasUserCondition: boolean,
    cause?: unknown,
  ): DynamoDBError {
    return hasUserCondition
      ? DynamoDBError.conditionCheckFailed(cause)
      : DynamoDBError.noItemToUpdate(cause);
  }

  mapRetryUpdateError(
    error: DynamoDBError,
    hasUserCondition: boolean,
  ): DynamoDBError {
    if (error._tag === 'UpdateItemFailed' && isConditionalCheckFailed(error)) {
      return this.#currentConditionError(hasUserCondition, error.cause);
    }
    return error;
  }

  prepareUpdate(
    keyValue: Record<string, unknown>,
    updates: Partial<Omit<ESchemaType<TSchema>, '_v'>>,
    condition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
    existingDeleted = false,
  ): Effect.Effect<
    {
      pk: string;
      sk: string;
      restamp: (u: string) => { exprResult: UpdateExprResult; meta: MetaType };
    },
    DynamoDBError
  > {
    return Effect.gen({ self: this }, function* () {
      const pk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#index.primary.pkDeps,
        keyValue,
        true,
      );
      const sk = deriveIndexKeyValue(
        this.#eschema.name,
        this.#index.primary.skDeps,
        keyValue,
        false,
      );

      const { _d, _e, _v, _u: _uInput, ...entityUpdates } = updates as any;

      const encodedUpdates = yield* (
        Schema.encodeEffect(
          this.#eschema.schema.mapFields(Struct.map(Schema.optional)),
        )(entityUpdates) as Effect.Effect<
          Record<string, unknown>,
          unknown,
          never
        >
      ).pipe(Effect.mapError((e) => DynamoDBError.updateItemFailed(e)));

      const builtCondition = this.#buildUpdateCondition(condition, expectedU);

      const restamp = (_u: string) => {
        const updatesWithMeta = { ...encodedUpdates, _u };
        const indexMap = this.#index.secondaryAttributes(updatesWithMeta);

        const meta: MetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: _d ?? existingDeleted,
        };

        const update = exprUpdate<any>(($) => [
          ...Object.entries({ ...encodedUpdates, ...indexMap }).map(
            ([key, v]) => $.set(key, v),
          ),
          $.set('_u', _u),
          ...(_d !== undefined ? [$.set('_d', _d)] : []),
        ]);

        const exprResult = buildExpr({
          update,
          condition: builtCondition,
        });

        return { exprResult, meta };
      };

      return { pk, sk, restamp };
    });
  }

  prepareUpdateExpr(
    keyValue: Record<string, unknown>,
    builder: (ops: UpdateOps<any>) => AnyOperation<any>[],
    condition?: ConditionInput<ESchemaType<TSchema>>,
    expectedU?: string,
    existingDeleted = false,
  ): Effect.Effect<
    {
      pk: string;
      sk: string;
      restamp: (u: string) => { exprResult: UpdateExprResult; meta: MetaType };
    },
    DynamoDBError
  > {
    return Effect.gen({ self: this }, function* () {
      const { pk, sk } = this.#index.primaryKey(keyValue);

      const userOps = exprUpdate<any>(builder);
      const touchedKeys = extractKeysFromOps(userOps);

      for (const key of touchedKeys) {
        if (this.#index.derivationDependencies.has(key)) {
          return yield* Effect.fail(
            DynamoDBError.updateItemFailed(
              `Cannot use expression builder to update "${key}" because it is a derivation dependency. Use a plain partial update instead.`,
            ),
          );
        }
      }

      const builtCondition = this.#buildUpdateCondition(condition, expectedU);

      const restamp = (_u: string) => {
        const indexMap = this.#index.secondaryAttributes({ _u });

        const meta: MetaType = {
          _e: this.#eschema.name,
          _v: this.#eschema.latestVersion,
          _u,
          _d: existingDeleted,
        };

        const update = exprUpdate<any>(($) => [
          ...userOps,
          ...Object.entries(indexMap).map(([key, v]) => $.set(key, v)),
          $.set('_u', _u),
        ]);

        const exprResult = buildExpr({
          update,
          condition: builtCondition,
        });

        return { exprResult, meta };
      };

      return { pk, sk, restamp };
    });
  }
}
