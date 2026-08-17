import { Effect } from 'effect';
import { nextUlid, type EntityType } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import {
  DatabaseError,
  ItemAlreadyExists,
  NoItemToUpdate,
  PrimaryKeyUpdateNotSupported,
  UpdateRefused,
} from '../error/index.js';
import {
  StdTableService,
  ConditionFailure,
  type JsonObject,
  type ContractFailure,
  type EncodedItem,
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
  EntityKey,
  EntityValue,
  InsertValue,
  KeyedEntity,
  TransactOp,
  QueryOptions,
  UpdateInput,
  UpdateValue,
} from './entity.js';
import {
  decode,
  derivedKey,
  derivedIndexes,
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
  const read = (key: EntityKey<S, Pk>) =>
    Effect.gen(function* () {
      const encodedKey = key as object as JsonObject;
      const contract = (yield* service).contract;
      const item = yield* contract
        .getItem(derivedKey(definition, encodedKey))
        .pipe(
          Effect.mapError((error) =>
            dbError('get', error as ContractFailure, definition.name),
          ),
        );
      if (item === null) return null;
      const value = yield* decode(definition.schema, item);
      return entityResult(item, value);
    });
  const makeOp = (
    item: EncodedItem,
    value: EntityValue<S>,
    operationKind: TransactOp<Name>['operationKind'],
    condition?: ItemCondition,
  ): TransactOp<Name, EntityValue<S>> => ({
    tableName: definition.table.logicalName,
    entityName: definition.name,
    key: { pk: item.pk, sk: item.sk },
    target: `${item.pk}\0${item.sk}`,
    operationKind,
    apply: (version) => {
      const next = {
        ...item,
        meta: { ...item.meta, _u: version },
        keys: derivedIndexes(definition, { ...item.data, _u: version }),
      };
      return {
        write: {
          kind: 'put',
          item: next,
          ...(condition === undefined ? {} : { condition }),
        },
        entity: entityResult(next, value),
      };
    },
  });
  const insertOp = (value: InsertValue<S>) =>
    Effect.gen(function* () {
      const full = value as object as EntityValue<S>;
      const encoded = yield* encode(definition.schema, full, definition.name);
      return makeOp(
        makeEncodedItem(definition, encoded, '', false),
        full,
        'insertOp',
        { kind: 'not-exists' },
      );
    });
  const buildUpdateOp = (
    existing: EntityType<EntityValue<S>>,
    partial: UpdateValue<S>,
    kind: 'updateOp' | 'deleteOp' | 'restoreOp',
    options?: { readonly lastWriteWins?: boolean },
  ) =>
    Effect.gen(function* () {
      const value = {
        ...existing.value,
        ...partial,
      } as object as EntityValue<S>;
      const changedPrimaryFields = [
        ...definition.primary.pk,
        ...definition.primary.sk,
      ].filter(
        (field) =>
          existing.value[field as keyof EntityValue<S>] !==
          value[field as keyof EntityValue<S>],
      );
      if (changedPrimaryFields.length > 0) {
        return yield* failReason(
          new PrimaryKeyUpdateNotSupported({
            entity: definition.name,
            fields: changedPrimaryFields,
          }),
        );
      }
      const encoded = yield* encode(definition.schema, value, definition.name);
      const deleted =
        kind === 'deleteOp'
          ? true
          : kind === 'restoreOp'
            ? false
            : existing.meta._d;
      return makeOp(
        makeEncodedItem(definition, encoded, '', deleted),
        value,
        kind,
        options?.lastWriteWins
          ? undefined
          : { kind: 'updated', value: existing.meta._u },
      );
    });
  const updateOp = (
    key: EntityKey<S, Pk>,
    update: UpdateInput<S>,
    kind: 'updateOp' | 'deleteOp' | 'restoreOp',
    options?: { readonly lastWriteWins?: boolean },
  ) =>
    Effect.gen(function* () {
      const existing = yield* read(key);
      if (existing === null)
        return yield* failReason(
          new NoItemToUpdate({ entity: definition.name }),
        );
      const partial =
        kind === 'updateOp'
          ? typeof update === 'function'
            ? update(existing.value as EntityValue<S>)
            : update
          : {};
      if (partial === null)
        return yield* failReason(
          new UpdateRefused({ entity: definition.name }),
        );
      return yield* buildUpdateOp(
        existing as EntityType<EntityValue<S>>,
        partial,
        kind,
        options,
      );
    });
  const checkOp = (value: JsonObject, condition: ItemCondition) =>
    Effect.sync((): CheckOp<Name> => {
      const key = derivedKey(definition, value);
      return {
        tableName: definition.table.logicalName,
        entityName: definition.name,
        key,
        target: `${key.pk}\0${key.sk}`,
        operationKind: 'checkOp',
        apply: () => ({
          write: { kind: 'check', key, condition },
          entity: null,
        }),
      };
    });
  const commit = (operation: string, op: TransactOp<Name, EntityValue<S>>) =>
    Effect.gen(function* () {
      const contract = (yield* service).contract;
      const version = yield* nextUlid;
      const applied = op.apply(version);
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
      return applied.entity as EntityType<EntityValue<S>>;
    });
  const tombstone = (key: EntityKey<S, Pk>, deleted: boolean) =>
    Effect.gen(function* () {
      const existing = yield* read(key);
      if (existing === null)
        return yield* failReason(
          new NoItemToUpdate({ entity: definition.name }),
        );
      if (existing.meta._d === deleted) return existing;
      const op = yield* buildUpdateOp(
        existing as EntityType<EntityValue<S>>,
        {},
        deleted ? 'deleteOp' : 'restoreOp',
      );
      return yield* commit(deleted ? 'delete' : 'restore', op);
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
      insertOp(value).pipe(Effect.flatMap((op) => commit('insert', op))),
    insertOp,
    getAndUpdate: (
      key: EntityKey<S, Pk>,
      update: UpdateInput<S>,
      options?: { retries?: number; lastWriteWins?: boolean },
    ) =>
      Effect.gen(function* () {
        for (let attempt = 0; ; attempt++) {
          const existing = yield* read(key);
          if (existing === null)
            return yield* failReason(
              new NoItemToUpdate({ entity: definition.name }),
            );
          const partial =
            typeof update === 'function'
              ? update(existing.value as EntityValue<S>)
              : update;
          if (partial === null) return existing;
          const op = yield* buildUpdateOp(
            existing as EntityType<EntityValue<S>>,
            partial,
            'updateOp',
            options,
          );
          const result = yield* commit('getAndUpdate', op).pipe(Effect.result);
          if (result._tag === 'Success') return result.success;
          if (
            result.failure.reason._tag !== 'ConditionFailed' ||
            attempt >= (options?.retries ?? 3)
          )
            return yield* Effect.fail(result.failure);
        }
      }),
    getAndUpdateOp: (
      key: EntityKey<S, Pk>,
      update: UpdateInput<S>,
      options?: { lastWriteWins?: boolean },
    ) => updateOp(key, update, 'updateOp', options),
    delete: (key: EntityKey<S, Pk>) => tombstone(key, true),
    deleteOp: (key: EntityKey<S, Pk>, options?: { lastWriteWins?: boolean }) =>
      updateOp(key, {}, 'deleteOp', options),
    restore: (key: EntityKey<S, Pk>) => tombstone(key, false),
    restoreOp: (key: EntityKey<S, Pk>, options?: { lastWriteWins?: boolean }) =>
      updateOp(key, {}, 'restoreOp', options),
    unchangedOp: (entity: EntityType<EntityValue<S>>) =>
      checkOp(entity.value as object as JsonObject, {
        kind: 'updated',
        value: entity.meta._u,
      }),
    existsOp: (key: EntityKey<S, Pk>) =>
      checkOp(key as object as JsonObject, { kind: 'exists' }),
    notExistsOp: (key: EntityKey<S, Pk>) =>
      checkOp(key as object as JsonObject, { kind: 'not-exists' }),
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
        const deleted: EntityType<EntityValue<S>> = {
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
