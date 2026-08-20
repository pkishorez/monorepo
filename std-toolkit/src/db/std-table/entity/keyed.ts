import { Effect } from 'effect';
import {
  nextUlid,
  type DecodedEntity,
  type EncodedEntity,
} from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import {
  CheckRefused,
  DatabaseError,
  ItemAlreadyExists,
  NoItemToCheck,
  NoItemToUpdate,
  PrimaryKeyUpdateNotSupported,
} from '../error/index.js';
import {
  StdTableService,
  ConditionFailure,
  type JsonObject,
  type ContractFailure,
  type EncodedData,
  type EncodedItem,
  type EncodedKey,
  type ItemCondition,
} from '../contract/index.js';
import type {
  AccessPatternMap,
  KeyedEntityDefinition,
} from '../definition/index.js';
import { queryEntity } from './query.js';
import { broadcast, dbError, failReason } from './effects.js';
import type {
  CheckOp,
  EntityInvariant,
  EntityKey,
  EntityValue,
  InsertValue,
  KeyedEntity,
  TransactOp,
  QueryOptions,
  UpdateInput,
  UpdateValue,
  WriteOptions,
} from './entity.js';
import {
  decode,
  derivedKey,
  encode,
  entityResult,
  makeEncodedItem,
} from './storage.js';

export const makeKeyedEntity = <
  Name extends string,
  S extends AnyEntityESchema,
  Pk extends readonly string[],
  Patterns extends AccessPatternMap,
>(
  definition: KeyedEntityDefinition<
    Name,
    S,
    Pk,
    readonly [S['idField']],
    Patterns
  >,
): KeyedEntity<Name, S, Pk, Patterns> => {
  const service = StdTableService(definition.table.logicalName);
  const readItem = (key: EncodedKey, consistent?: boolean) =>
    Effect.gen(function* () {
      const contract = (yield* service).contract;
      return yield* contract
        .getItem(key, consistent === undefined ? undefined : { consistent })
        .pipe(
          Effect.mapError((error) =>
            dbError('get', error as ContractFailure, definition.name),
          ),
        );
    });
  const readRaw = (key: JsonObject, consistent?: boolean) =>
    readItem(derivedKey(definition, key), consistent);
  const decodeCurrent = (item: EncodedItem) =>
    decode(definition.schema, item) as Effect.Effect<
      DecodedEntity<EntityValue<S>>,
      DatabaseError
    >;
  const read = (key: EntityKey<S, Pk>) =>
    readRaw(key as object as JsonObject).pipe(
      Effect.flatMap((item) =>
        item === null
          ? Effect.succeed(null)
          : (decodeCurrent(item) as Effect.Effect<
              DecodedEntity<EntityValue<S>> | null,
              DatabaseError
            >),
      ),
    );

  const put = (
    encoded: EncodedEntity<EncodedData>,
    value: EntityValue<S>,
    deleted: boolean,
    version: string,
    condition: ItemCondition | undefined,
  ) => {
    const item = makeEncodedItem(definition, encoded, version, deleted);
    return {
      write: {
        kind: 'put' as const,
        item,
        ...(condition === undefined ? {} : { condition }),
      },
      entity: entityResult(item, value) as DecodedEntity<EntityValue<S>>,
    };
  };

  const applyUpdate = (
    kind: 'updateOp' | 'deleteOp' | 'restoreOp',
    update: UpdateInput<S>,
    options: WriteOptions<EntityValue<S>> | undefined,
    current: EncodedItem | null,
    version: string,
  ) =>
    Effect.gen(function* () {
      if (current === null)
        return yield* failReason(
          new NoItemToUpdate({ entity: definition.name }),
        );
      const existing = yield* decodeCurrent(current);
      const check = options?.check;
      if (check !== undefined && check(existing.value) !== true)
        return yield* failReason(new CheckRefused({ entity: definition.name }));
      const deleted =
        kind === 'deleteOp'
          ? true
          : kind === 'restoreOp'
            ? false
            : current.meta._d;
      const partial =
        kind === 'updateOp'
          ? typeof update === 'function'
            ? update(existing.value)
            : update
          : ({} as UpdateValue<S>);
      const value = { ...existing.value, ...partial } as EntityValue<S>;
      const changedPrimaryFields = [
        ...definition.primary.pk,
        ...definition.primary.sk,
      ].filter(
        (field) =>
          existing.value[field as keyof EntityValue<S>] !==
          value[field as keyof EntityValue<S>],
      );
      if (changedPrimaryFields.length > 0)
        return yield* failReason(
          new PrimaryKeyUpdateNotSupported({
            entity: definition.name,
            fields: changedPrimaryFields,
          }),
        );
      const encoded = yield* encode(definition.schema, value, definition.name);
      return put(
        encoded,
        value,
        deleted,
        version,
        options?.lastWriteWins
          ? undefined
          : { kind: 'updated', value: current.meta._u },
      );
    });

  const located = (key: JsonObject) => {
    const derived = derivedKey(definition, key);
    return { key: derived, target: `${derived.pk}\0${derived.sk}` };
  };

  const insertOp = (value: InsertValue<S>) =>
    Effect.gen(function* () {
      const full = value as object as EntityValue<S>;
      const encoded = yield* encode(definition.schema, full, definition.name);
      const item = makeEncodedItem(definition, encoded, '', false);
      return {
        tableName: definition.table.logicalName,
        entityName: definition.name,
        key: { pk: item.pk, sk: item.sk },
        target: `${item.pk}\0${item.sk}`,
        readsCurrent: false,
        operationKind: 'insertOp' as const,
        apply: (_current: EncodedItem | null, version: string) =>
          Effect.succeed(
            put(encoded, full, false, version, { kind: 'not-exists' }),
          ),
      } as TransactOp<Name, EntityValue<S>>;
    });

  const updateOp = (
    kind: 'updateOp' | 'deleteOp' | 'restoreOp',
    key: EntityKey<S, Pk>,
    update: UpdateInput<S>,
    options?: WriteOptions<EntityValue<S>>,
  ) =>
    Effect.sync((): TransactOp<Name, EntityValue<S>> => ({
      tableName: definition.table.logicalName,
      entityName: definition.name,
      ...located(key as object as JsonObject),
      readsCurrent: true,
      operationKind: kind,
      apply: (current, version) =>
        applyUpdate(kind, update, options, current, version),
    }));

  const conditionOp = (value: JsonObject, condition: ItemCondition) =>
    Effect.sync((): CheckOp<Name> => {
      const at = located(value);
      return {
        tableName: definition.table.logicalName,
        entityName: definition.name,
        ...at,
        readsCurrent: false,
        operationKind: 'checkOp',
        apply: () =>
          Effect.succeed({
            write: { kind: 'check' as const, key: at.key, condition },
            entity: null,
          }),
      };
    });

  const getAndCheckOp = (
    key: EntityKey<S, Pk>,
    check: EntityInvariant<EntityValue<S>>,
  ) =>
    Effect.sync((): CheckOp<Name> => {
      const at = located(key as object as JsonObject);
      return {
        tableName: definition.table.logicalName,
        entityName: definition.name,
        ...at,
        readsCurrent: true,
        operationKind: 'checkOp',
        apply: (current) =>
          Effect.gen(function* () {
            if (current === null || current.meta._d)
              return yield* failReason(
                new NoItemToCheck({ entity: definition.name }),
              );
            const existing = yield* decodeCurrent(current);
            if (check(existing.value) !== true)
              return yield* failReason(
                new CheckRefused({ entity: definition.name }),
              );
            return {
              write: {
                kind: 'check' as const,
                key: at.key,
                condition: {
                  kind: 'updated' as const,
                  value: current.meta._u,
                },
              },
              entity: null,
            };
          }),
      };
    });

  const runOne = (operation: string, op: TransactOp<Name, EntityValue<S>>) =>
    Effect.gen(function* () {
      const current = op.readsCurrent ? yield* readItem(op.key, true) : null;
      const version = yield* nextUlid;
      const applied = yield* op.apply(current, version);
      const contract = (yield* service).contract;
      yield* contract.writeItem(applied.write).pipe(
        Effect.mapError((error) => {
          if (operation === 'insert' && error instanceof ConditionFailure)
            return new DatabaseError({
              reason: new ItemAlreadyExists({ entity: definition.name }),
            });
          return dbError(operation, error as ContractFailure, definition.name);
        }),
      );
      yield* broadcast(applied.entity);
      return applied.entity as DecodedEntity<EntityValue<S>>;
    });

  const runWithRetry = (
    operation: string,
    op: TransactOp<Name, EntityValue<S>>,
    retries: number,
  ) =>
    Effect.gen(function* () {
      for (let attempt = 0; ; attempt++) {
        const result = yield* runOne(operation, op).pipe(Effect.result);
        if (result._tag === 'Success') return result.success;
        if (
          result.failure.reason._tag !== 'ConditionFailed' ||
          attempt >= retries
        )
          return yield* Effect.fail(result.failure);
      }
    });
  const entity = {
    ...definition,
    get: (key: EntityKey<S, Pk>, options?: { excludeDeleted?: boolean }) =>
      read(key).pipe(
        Effect.map((result) =>
          options?.excludeDeleted && result?.meta._d ? null : result,
        ),
      ),
    insert: (value: InsertValue<S>) =>
      insertOp(value).pipe(Effect.flatMap((op) => runOne('insert', op))),
    insertOp,
    getAndUpdate: (
      key: EntityKey<S, Pk>,
      update: UpdateInput<S>,
      options?: WriteOptions<EntityValue<S>> & { retries?: number },
    ) =>
      updateOp('updateOp', key, update, options).pipe(
        Effect.flatMap((op) =>
          runWithRetry('getAndUpdate', op, options?.retries ?? 3),
        ),
      ),
    getAndUpdateOp: (
      key: EntityKey<S, Pk>,
      update: UpdateInput<S>,
      options?: WriteOptions<EntityValue<S>>,
    ) => updateOp('updateOp', key, update, options),
    getAndCheckOp,
    delete: (key: EntityKey<S, Pk>, options?: WriteOptions<EntityValue<S>>) =>
      updateOp('deleteOp', key, {}, options).pipe(
        Effect.flatMap((op) => runOne('delete', op)),
      ),
    deleteOp: (key: EntityKey<S, Pk>, options?: WriteOptions<EntityValue<S>>) =>
      updateOp('deleteOp', key, {}, options),
    restore: (key: EntityKey<S, Pk>, options?: WriteOptions<EntityValue<S>>) =>
      updateOp('restoreOp', key, {}, options).pipe(
        Effect.flatMap((op) => runOne('restore', op)),
      ),
    restoreOp: (
      key: EntityKey<S, Pk>,
      options?: WriteOptions<EntityValue<S>>,
    ) => updateOp('restoreOp', key, {}, options),
    unchangedOp: (entity: DecodedEntity<EntityValue<S>>) =>
      conditionOp(entity.value as object as JsonObject, {
        kind: 'updated',
        value: entity.meta._u,
      }),
    existsOp: (key: EntityKey<S, Pk>) =>
      conditionOp(key as object as JsonObject, { kind: 'exists' }),
    notExistsOp: (key: EntityKey<S, Pk>) =>
      conditionOp(key as object as JsonObject, { kind: 'not-exists' }),
    hardDelete: (
      key: EntityKey<S, Pk>,
      _confirmation: 'I KNOW WHAT I AM DOING',
    ) =>
      Effect.gen(function* () {
        const existing = yield* read(key);
        if (existing === null)
          return yield* failReason(
            new NoItemToUpdate({ entity: definition.name }),
          );
        const contract = (yield* service).contract;
        yield* contract
          .hardDeleteItem(derivedKey(definition, key as object as JsonObject))
          .pipe(
            Effect.mapError((error) =>
              dbError('hardDelete', error as ContractFailure, definition.name),
            ),
          );
        const deleted: DecodedEntity<EntityValue<S>> = {
          value: existing.value as EntityValue<S>,
          meta: { ...existing.meta, _d: true },
        };
        yield* broadcast(deleted);
        return deleted;
      }),
    dangerouslyRemoveAllItems: (_confirmation: 'I KNOW WHAT I AM DOING') =>
      Effect.gen(function* () {
        const contract = (yield* service).contract;
        const itemsDeleted = yield* contract
          .hardDeleteEntityItems(definition.name)
          .pipe(
            Effect.mapError((error) =>
              dbError(
                'dangerouslyRemoveAllItems',
                error as ContractFailure,
                definition.name,
              ),
            ),
          );
        return { itemsDeleted };
      }),
    query: (
      patternName: keyof Patterns & string,
      input: JsonObject,
      options?: QueryOptions<EntityValue<S>>,
    ) => queryEntity(definition, patternName, input, options),
  };
  return entity as unknown as KeyedEntity<Name, S, Pk, Patterns>;
};
