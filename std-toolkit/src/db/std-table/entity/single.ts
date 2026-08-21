import { Effect } from 'effect';
import { nextUlid, type DecodedSingleEntity } from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import { CheckRefused, DatabaseError, NoItemToUpdate } from '../error/index.js';
import {
  StdTableService,
  type ContractFailure,
  type EncodedItem,
} from '../contract/index.js';
import type { SingleEntityDefinition } from '../definition/index.js';
import type {
  CheckOp,
  SingleEntity,
  SingleUpdateInput,
  WriteOptions,
  TransactOp,
} from './entity.js';
import { broadcast, dbError, failReason, subscribe } from './effects.js';
import { decodeSingle, encodeSingle, singleKey } from './storage.js';

export const makeSingleEntity = <
  Name extends string,
  S extends AnyUnkeyedESchema,
>(
  definition: SingleEntityDefinition<Name, S>,
): SingleEntity<Name, S> => {
  const service = StdTableService(definition.table.logicalName);
  const key = singleKey(definition.name);
  const absent = () =>
    ({
      value: definition.defaultValue,
      meta: { _e: definition.name, _u: '' },
    }) as DecodedSingleEntity<S['Type']>;
  const readRaw = (consistent?: boolean) =>
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
  const decodeCurrent = (item: EncodedItem | null) =>
    item === null
      ? Effect.succeed(absent())
      : decodeSingle(definition.schema, item);
  const read = readRaw().pipe(Effect.flatMap(decodeCurrent));

  const put = (
    value: S['Type'],
    current: DecodedSingleEntity<S['Type']>,
    version: string,
    lastWriteWins: boolean | undefined,
  ) =>
    Effect.gen(function* () {
      const encoded = yield* encodeSingle(
        definition.schema,
        value,
        definition.name,
      );
      const item: EncodedItem = {
        ...key,
        meta: { _e: definition.name, _u: version, _d: false },
        data: encoded.value,
        keys: {},
      };
      return {
        write: {
          kind: 'put' as const,
          item,
          ...(lastWriteWins
            ? {}
            : {
                condition:
                  current.meta._u === ''
                    ? ({ kind: 'not-exists' } as const)
                    : ({ kind: 'updated', value: current.meta._u } as const),
              }),
        },
        entity: {
          value,
          meta: { _e: definition.name, _u: version },
        } as DecodedSingleEntity<S['Type']>,
      };
    });

  const makeOp = (
    resolve: (
      current: DecodedSingleEntity<S['Type']>,
      version: string,
    ) => Effect.Effect<
      {
        readonly write: { readonly kind: 'put' };
        readonly entity: DecodedSingleEntity<S['Type']>;
      },
      DatabaseError
    >,
  ) =>
    Effect.sync(
      () =>
        ({
          tableName: definition.table.logicalName,
          entityName: definition.name,
          key,
          target: `${key.pk}\0${key.sk}`,
          readsCurrent: true,
          operationKind: 'singleUpdateOp',
          apply: (current: EncodedItem | null, version: string) =>
            decodeCurrent(current).pipe(
              Effect.flatMap((decoded) => resolve(decoded, version)),
            ),
        }) as unknown as TransactOp<Name, S['Type']>,
    );

  const updateOp = (
    update: SingleUpdateInput<S>,
    options?: WriteOptions<S['Type']> & { requireExisting?: boolean },
  ) =>
    makeOp((current, version) =>
      Effect.gen(function* () {
        if (options?.requireExisting && current.meta._u === '')
          return yield* failReason(
            new NoItemToUpdate({ entity: definition.name }),
          );
        if (
          options?.check !== undefined &&
          options.check(current.value) !== true
        )
          return yield* failReason(
            new CheckRefused({ entity: definition.name }),
          );
        const partial =
          typeof update === 'function' ? update(current.value) : update;
        return yield* put(
          { ...current.value, ...partial },
          current,
          version,
          options?.lastWriteWins,
        );
      }),
    );

  const replaceOp = (value: S['Type'], options?: { lastWriteWins?: boolean }) =>
    makeOp((current, version) =>
      put(value, current, version, options?.lastWriteWins),
    );

  const runOne = (op: TransactOp<Name, S['Type']>) =>
    Effect.gen(function* () {
      const current = op.readsCurrent ? yield* readRaw(true) : null;
      const version = yield* nextUlid;
      const applied = yield* op.apply(current, version);
      const contract = (yield* service).contract;
      yield* contract
        .writeItem(applied.write)
        .pipe(
          Effect.mapError((error) =>
            dbError('single.put', error as ContractFailure, definition.name),
          ),
        );
      yield* broadcast(applied.entity as DecodedSingleEntity<S['Type']>);
      return applied.entity as DecodedSingleEntity<S['Type']>;
    });

  const runWithRetry = (op: TransactOp<Name, S['Type']>, retries = 3) =>
    Effect.gen(function* () {
      for (let attempt = 0; ; attempt++) {
        const result = yield* runOne(op).pipe(Effect.result);
        if (result._tag === 'Success') return result.success;
        if (
          result.failure.reason._tag !== 'ConditionFailed' ||
          attempt >= retries
        )
          return yield* Effect.fail(result.failure);
      }
    });

  return {
    ...definition,
    get: () => read,
    put: (value: S['Type']) =>
      replaceOp(value, { lastWriteWins: true }).pipe(
        Effect.flatMap((op) => runOne(op)),
      ),
    getAndUpdate: (
      input: SingleUpdateInput<S>,
      options?: WriteOptions<S['Type']> & { retries?: number },
    ) =>
      updateOp(input, options).pipe(
        Effect.flatMap((op) => runWithRetry(op, options?.retries ?? 3)),
      ),
    getAndUpdateOp: (
      input: SingleUpdateInput<S>,
      options?: WriteOptions<S['Type']>,
    ) => updateOp(input, { ...options, requireExisting: true }),
    unchangedOp: (entity: DecodedSingleEntity<S['Type']>) =>
      Effect.sync((): CheckOp<Name> => ({
        tableName: definition.table.logicalName,
        entityName: definition.name,
        key,
        target: `${key.pk}\0${key.sk}`,
        readsCurrent: false,
        operationKind: 'checkOp',
        apply: () =>
          Effect.succeed({
            write: {
              kind: 'check' as const,
              key,
              condition:
                entity.meta._u === ''
                  ? ({ kind: 'not-exists' } as const)
                  : ({ kind: 'updated', value: entity.meta._u } as const),
            },
            entity: null,
          }),
      })),
    reset: () =>
      replaceOp(definition.defaultValue).pipe(
        Effect.flatMap((op) => runWithRetry(op)),
      ),
    subscribe: (filter?: Partial<S['Type']>) =>
      subscribe<S['Type']>(definition.name, filter),
  } as unknown as SingleEntity<Name, S>;
};
