import { Effect } from 'effect';
import { nextUlid, type DecodedSingleEntity } from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import { NoItemToUpdate, UpdateRefused } from '../error/index.js';
import {
  StdTableService,
  type ContractFailure,
  type EncodedItem,
} from '../contract/index.js';
import type { SingleEntityDefinition } from '../definition/index.js';
import type { CheckOp, SingleEntity, TransactOp } from './entity.js';
import { broadcast, dbError, failReason } from './effects.js';
import { decodeSingle, encodeSingle, singleKey } from './storage.js';

export const makeSingleEntity = <
  Name extends string,
  S extends AnyUnkeyedESchema,
>(
  definition: SingleEntityDefinition<Name, S>,
): SingleEntity<Name, S> => {
  const service = StdTableService(definition.table.logicalName);
  const key = singleKey(definition.name);
  const read = Effect.gen(function* () {
    const contract = (yield* service).contract;
    const item = yield* contract
      .getItem(key)
      .pipe(
        Effect.mapError((error) =>
          dbError('get', error as ContractFailure, definition.name),
        ),
      );
    if (item === null)
      return {
        value: definition.defaultValue,
        meta: {
          _e: definition.name,
          _u: '',
        },
      } as DecodedSingleEntity<S['Type']>;
    return yield* decodeSingle(definition.schema, item);
  });
  const makeOp = (
    value: S['Type'],
    current: DecodedSingleEntity<S['Type']>,
    lastWriteWins?: boolean,
  ) =>
    Effect.gen(function* () {
      const encoded = yield* encodeSingle(
        definition.schema,
        value,
        definition.name,
      );
      const item: EncodedItem = {
        ...key,
        meta: {
          _e: definition.name,
          _u: '',
          _d: false,
        },
        data: encoded.value,
        keys: {},
      };
      return {
        tableName: definition.table.logicalName,
        entityName: definition.name,
        key,
        target: `${key.pk}\0${key.sk}`,
        operationKind: 'singleUpdateOp',
        apply: (version: string) => ({
          write: {
            kind: 'put',
            item: { ...item, meta: { ...item.meta, _u: version } },
            condition: lastWriteWins
              ? undefined
              : current.meta._u === ''
                ? { kind: 'not-exists' }
                : { kind: 'updated', value: current.meta._u },
          },
          entity: {
            value,
            meta: {
              _e: definition.name,
              _u: version,
            },
          },
        }),
      } as TransactOp<Name, S['Type']>;
    });
  const commit = (op: TransactOp<Name, S['Type']>) =>
    Effect.gen(function* () {
      const contract = (yield* service).contract;
      const version = yield* nextUlid;
      const applied = op.apply(version);
      yield* contract
        .writeItem(applied.write)
        .pipe(
          Effect.mapError((error) =>
            dbError('single.put', error as ContractFailure, definition.name),
          ),
        );
      yield* broadcast(applied.entity);
      return applied.entity as DecodedSingleEntity<S['Type']>;
    });
  const updateOp = (
    update:
      | Partial<S['Type']>
      | ((current: S['Type']) => Partial<S['Type']> | null),
    options?: { lastWriteWins?: boolean },
  ) =>
    Effect.gen(function* () {
      const current = yield* read;
      const partial =
        typeof update === 'function' ? update(current.value) : update;
      return partial === null
        ? null
        : yield* makeOp(
            { ...current.value, ...partial },
            current,
            options?.lastWriteWins,
          );
    });
  const replaceOp = (value: S['Type'], options?: { lastWriteWins?: boolean }) =>
    Effect.gen(function* () {
      const current = yield* read;
      return yield* makeOp(value, current, options?.lastWriteWins);
    });
  const commitWithRetry = <E, R>(
    prepare: Effect.Effect<TransactOp<Name, S['Type']> | null, E, R>,
    retries = 3,
  ) =>
    Effect.gen(function* () {
      for (let attempt = 0; ; attempt++) {
        const op = yield* prepare;
        if (op === null) return yield* read;
        const result = yield* commit(op).pipe(Effect.result);
        if (result._tag === 'Success') return result.success;
        if (
          result.failure.reason._tag !== 'ConditionFailed' ||
          attempt >= retries
        )
          return yield* Effect.fail(result.failure);
      }
    });
  const update = (
    input:
      | Partial<S['Type']>
      | ((current: S['Type']) => Partial<S['Type']> | null),
    options?: { retries?: number; lastWriteWins?: boolean },
  ) => commitWithRetry(updateOp(input, options), options?.retries);
  const replace = (
    value: S['Type'],
    options?: { retries?: number; lastWriteWins?: boolean },
  ) => commitWithRetry(replaceOp(value, options), options?.retries);
  return {
    ...definition,
    get: () => read,
    put: (value) => replace(value, { lastWriteWins: true }),
    getAndUpdate: update,
    getAndUpdateOp: (input, options) =>
      Effect.gen(function* () {
        const current = yield* read;
        if (current.meta._u === '')
          return yield* failReason(
            new NoItemToUpdate({ entity: definition.name }),
          );
        const partial =
          typeof input === 'function' ? input(current.value) : input;
        if (partial === null)
          return yield* failReason(
            new UpdateRefused({ entity: definition.name }),
          );
        return yield* makeOp(
          { ...current.value, ...partial },
          current,
          options?.lastWriteWins,
        );
      }),
    unchangedOp: (entity: DecodedSingleEntity<S['Type']>) =>
      Effect.sync((): CheckOp<Name> => ({
        tableName: definition.table.logicalName,
        entityName: definition.name,
        key,
        target: `${key.pk}\0${key.sk}`,
        operationKind: 'checkOp',
        apply: () => ({
          write: {
            kind: 'check',
            key,
            condition:
              entity.meta._u === ''
                ? { kind: 'not-exists' }
                : { kind: 'updated', value: entity.meta._u },
          },
          entity: null,
        }),
      })),
    reset: () => replace(definition.defaultValue),
  };
};
