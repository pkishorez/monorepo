import { Effect, Option, Schema } from 'effect';
import { Broadcaster, nextUlid, type EntityType } from '../../../core/index.js';
import type { AnyEntityESchema, ESchemaType } from '../../../eschema/index.js';
import {
  deriveStorageIndexes,
  encodeCompositeKey,
} from '../../std-table/key/index.js';
import type { KeyedEntityDefinition } from '../../std-table/definition/index.js';
import type {
  JsonObject,
  EncodedItem,
} from '../../std-table/contract/index.js';
import {
  buildExpr,
  exprCondition,
  exprUpdate,
  type AnyOperation,
  type ConditionOperation,
  type UpdateOps,
} from '../expression/index.js';
import {
  decodeKey,
  itemSchema,
  type DecodedItem,
} from '../item-schema/index.js';
import { DynamoDBNativeError } from '../setup/index.js';
import { dynamoTableService, type DynamoTableService } from './native.js';

export interface DynamoEntityUpdateInput<
  S extends AnyEntityESchema,
  Pk extends readonly string[],
> {
  readonly key: Readonly<
    Pick<
      ESchemaType<S>,
      Extract<Pk[number] | S['idField'], keyof ESchemaType<S>>
    >
  >;
  readonly update: (
    operations: UpdateOps<ESchemaType<S>>,
  ) => AnyOperation<ESchemaType<S>>[];
  readonly condition?: ConditionOperation<ESchemaType<S>>;
}

interface PhysicalEntity<Value> {
  readonly data: Value;
  readonly _u: string;
  readonly _v: string;
}

const updateError = (cause: unknown) =>
  new DynamoDBNativeError({ operation: 'update', cause });

const tryUpdate = <Value>(evaluate: () => Value) =>
  Effect.try({ try: evaluate, catch: updateError });

const fieldStrings = (
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
) =>
  fields.map((field) => {
    const component = value[field];
    if (typeof component !== 'string') {
      throw new Error(`Primary key component "${field}" must be a string`);
    }
    return component;
  });

const entityKey = <S extends AnyEntityESchema>(
  entity: KeyedEntityDefinition<string, S>,
  value: Readonly<Record<string, unknown>>,
) => ({
  pk: encodeCompositeKey([
    entity.name,
    ...fieldStrings(value, entity.primary.pk),
  ]),
  sk: encodeCompositeKey(fieldStrings(value, entity.primary.sk)),
});

const patternAttributes = <S extends AnyEntityESchema>(
  entity: KeyedEntityDefinition<string, S>,
  pattern: (typeof entity.accessPatterns)[string],
) => {
  if (pattern.index === undefined) return undefined;
  if (pattern.kind === 'lsi') {
    const index = entity.table.localSecondaryIndexes[pattern.index];
    return index === undefined ? undefined : { sk: index.sk };
  }
  const index = entity.table.globalSecondaryIndexes[pattern.index];
  return index === undefined ? undefined : { pk: index.pk, sk: index.sk };
};

const indexKeys = <S extends AnyEntityESchema>(
  entity: KeyedEntityDefinition<string, S>,
  value: JsonObject,
) =>
  deriveStorageIndexes(
    entity.name,
    Object.values(entity.accessPatterns).map((pattern) => ({
      ...pattern,
      attributes: patternAttributes(entity, pattern),
    })),
    value,
  );

const rootPath = (path: string) => path.split(/[.[]/, 1)[0] ?? '';

const prefixPath = (path: unknown): string => `data.${String(path)}`;

const prefixUpdate = <Value>(
  operation: AnyOperation<Value>,
): AnyOperation<PhysicalEntity<Value>> => {
  if (Array.isArray(operation)) {
    return operation.map(prefixUpdate) as AnyOperation<PhysicalEntity<Value>>;
  }
  const next = { ...operation, key: prefixPath(operation.key) };
  if (
    operation.type === 'update_set_value' &&
    typeof operation.value === 'object' &&
    operation.value !== null &&
    'key' in operation.value
  ) {
    return {
      ...next,
      value: { ...operation.value, key: prefixPath(operation.value.key) },
    } as AnyOperation<PhysicalEntity<Value>>;
  }
  return next as AnyOperation<PhysicalEntity<Value>>;
};

const prefixCondition = <Value>(
  condition: ConditionOperation<Value>,
): ConditionOperation<PhysicalEntity<Value>> => {
  if (condition.type === 'condition_and' || condition.type === 'condition_or') {
    return {
      ...condition,
      conditions: condition.conditions.map(prefixCondition),
    } as ConditionOperation<PhysicalEntity<Value>>;
  }
  if (condition.type === 'condition_condition') {
    const value =
      typeof condition.value === 'object' &&
      condition.value !== null &&
      'type' in condition.value &&
      condition.value.type === 'field_ref' &&
      'key' in condition.value
        ? { ...condition.value, key: prefixPath(condition.value.key) }
        : condition.value;
    return {
      ...condition,
      key: prefixPath(condition.key),
      value,
    } as ConditionOperation<PhysicalEntity<Value>>;
  }
  return {
    ...condition,
    key: prefixPath(condition.key),
  } as ConditionOperation<PhysicalEntity<Value>>;
};

export const update = <
  Name extends string,
  S extends AnyEntityESchema,
  Pk extends readonly string[],
>(
  entity: KeyedEntityDefinition<Name, S, Pk>,
  input: DynamoEntityUpdateInput<S, Pk>,
): Effect.Effect<
  EntityType<ESchemaType<S>>,
  DynamoDBNativeError,
  DynamoTableService<Name>
> =>
  Effect.gen(function* () {
    const service = yield* dynamoTableService(entity.table.logicalName);
    const schema = itemSchema(entity.table);
    const key = yield* tryUpdate(() => entityKey(entity, input.key));
    const physicalEntityKey = yield* tryUpdate(() =>
      decodeKey(entity.table, key),
    );
    const existingOutput = yield* service.client
      .getItem({
        TableName: service.tableName,
        Key: physicalEntityKey,
        ConsistentRead: true,
      })
      .pipe(Effect.mapError(updateError));
    const physicalExisting = existingOutput.Item;
    if (physicalExisting === undefined) {
      return yield* Effect.fail(
        new DynamoDBNativeError({
          operation: 'update',
          cause: new Error(`Entity "${entity.name}" does not exist`),
        }),
      );
    }
    let existing = yield* Schema.encodeEffect(schema)(
      physicalExisting as DecodedItem,
    ).pipe(Effect.mapError(updateError));
    if (existing.meta._v !== entity.schema.latestVersion) {
      const decoded = yield* entity.schema
        .decode(existing.data)
        .pipe(
          Effect.mapError(
            (cause) => new DynamoDBNativeError({ operation: 'update', cause }),
          ),
        );
      const data = yield* entity.schema
        .encode(decoded)
        .pipe(
          Effect.mapError(
            (cause) => new DynamoDBNativeError({ operation: 'update', cause }),
          ),
        );
      const migrated: EncodedItem = {
        ...existing,
        data,
        meta: { ...existing.meta, _v: entity.schema.latestVersion },
        keys: indexKeys(entity, { ...data, _u: existing.meta._u }),
      };
      const physicalMigrated = yield* Schema.decodeEffect(schema)(
        migrated,
      ).pipe(Effect.mapError(updateError));
      const migrationCondition = yield* tryUpdate(() =>
        buildExpr({
          condition: exprCondition<PhysicalEntity<ESchemaType<S>>>(($) =>
            $.cond('_u', '=', existing.meta._u),
          ),
        }),
      );
      yield* service.client
        .putItem({
          TableName: service.tableName,
          Item: physicalMigrated,
          ...migrationCondition,
        })
        .pipe(Effect.mapError(updateError));
      existing = migrated;
    }
    const operations = yield* tryUpdate(() => exprUpdate(input.update));
    const forbidden = new Set([
      ...entity.primary.pk,
      ...entity.primary.sk,
      ...Object.values(entity.accessPatterns).flatMap(({ pk, sk }) => [
        ...pk,
        ...sk,
      ]),
      '_v',
      '_u',
      '_d',
    ]);
    const paths = (items: readonly AnyOperation<ESchemaType<S>>[]): string[] =>
      items.flatMap((operation) =>
        Array.isArray(operation) ? paths(operation) : [String(operation.key)],
      );
    const unsafe = paths(operations).filter((path) =>
      forbidden.has(rootPath(path)),
    );
    if (unsafe.length > 0) {
      return yield* Effect.fail(
        new DynamoDBNativeError({
          operation: 'update',
          cause: new Error(
            `DynamoDB entity update cannot modify key, index, or metadata fields: ${unsafe.join(', ')}`,
          ),
        }),
      );
    }
    const updated = yield* nextUlid;
    const physicalOperations = yield* tryUpdate(() =>
      operations.map(prefixUpdate),
    );
    const nextKeys = yield* tryUpdate(() =>
      indexKeys(entity, { ...existing.data, _u: updated }),
    );
    const metadata = yield* tryUpdate(() =>
      exprUpdate<unknown>(($) => [
        $.set('_u', updated),
        ...Object.entries(nextKeys).map(([attribute, value]) =>
          $.set(attribute, value),
        ),
      ]),
    );
    const currentVersion: ConditionOperation<PhysicalEntity<ESchemaType<S>>> = {
      type: 'condition_condition',
      key: '_v',
      op: '=',
      value: entity.schema.latestVersion,
    };
    const condition: ConditionOperation<PhysicalEntity<ESchemaType<S>>> =
      input.condition === undefined
        ? currentVersion
        : {
            type: 'condition_and',
            conditions: [currentVersion, prefixCondition(input.condition)],
          };
    const expression = yield* tryUpdate(() =>
      buildExpr({
        update: [...physicalOperations, ...metadata] as never,
        condition: condition as never,
      }),
    );
    const output = yield* service.client
      .updateItem({
        TableName: service.tableName,
        Key: physicalEntityKey,
        ...expression,
        ReturnValues: 'ALL_NEW',
      })
      .pipe(Effect.mapError(updateError));
    const physicalUpdated = output.Attributes;
    if (physicalUpdated === undefined) {
      return yield* Effect.fail(
        new DynamoDBNativeError({
          operation: 'update',
          cause: new Error('DynamoDB update returned no attributes'),
        }),
      );
    }
    const item = yield* Schema.encodeEffect(schema)(
      physicalUpdated as DecodedItem,
    ).pipe(Effect.mapError(updateError));
    const value = yield* entity.schema
      .decode(item.data)
      .pipe(
        Effect.mapError(
          (cause) => new DynamoDBNativeError({ operation: 'update', cause }),
        ),
      );
    const result = {
      value,
      meta: item.meta,
    } as EntityType<ESchemaType<S>>;
    const broadcaster = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    broadcaster?.broadcast([result]);
    return result;
  });
