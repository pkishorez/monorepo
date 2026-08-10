import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect } from 'effect';
import { nextUlid } from '../../../../core/index.js';
import type { IdbEntityTable } from '../idb-entity/index.js';
import {
  IdbDB,
  IdbDBError,
  type IdbRecord,
  type IdbWriteOp,
} from '../idb-database/index.js';
import {
  broadcastIdbSingleEntity,
  type IdbSingleEntityContext,
  type SingleEntityType,
} from './single-entity-context.js';

export type IdbSingleReadModifyWrite<T> =
  | Partial<Omit<T, '_v'>>
  | ((current: T) => Partial<Omit<T, '_v'>> | null);

export const makeIdbSingleEntityWriter = <
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  context: IdbSingleEntityContext<TTable, TSchema>,
  get: () => Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    IdbDBError,
    IdbDB
  >,
) => {
  const prepareValue = (value: Omit<ESchemaType<TSchema>, '_v'>) => {
    const fullValue = {
      ...value,
      _v: context.eschema.latestVersion,
    } as unknown as ESchemaType<TSchema>;
    return context.eschema.encode(fullValue as any).pipe(
      Effect.mapError((error) =>
        IdbDBError.putFailed(context.table.storeName, error),
      ),
      Effect.map((encoded) => ({ fullValue, encoded })),
    );
  };

  const put = (
    value: Omit<ESchemaType<TSchema>, '_v'>,
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> =>
    Effect.gen(function* () {
      const { fullValue, encoded } = yield* prepareValue(value);
      const _u = yield* nextUlid;
      const meta = {
        _e: context.eschema.name,
        _v: context.eschema.latestVersion,
        _u,
      };
      const existing = yield* context.table.getItem(context.key);
      if (existing.Item) {
        yield* context.table.updateItem(context.key, {
          _data: encoded,
          _v: context.eschema.latestVersion,
          _u,
        });
      } else {
        yield* context.table.putItem({
          ...context.key,
          _data: encoded,
          _e: context.eschema.name,
          _v: context.eschema.latestVersion,
          _u,
          _d: false,
        });
      }
      yield* broadcastIdbSingleEntity<TSchema>([
        { value: fullValue, meta: { ...meta, _d: false } },
      ]);
      return { value: fullValue, meta };
    }).pipe(
      Effect.withSpan('idb.single-entity.put', {
        attributes: { entity: context.eschema.name },
      }),
    );

  const getAndUpdate = (
    update: IdbSingleReadModifyWrite<ESchemaType<TSchema>>,
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> =>
    Effect.gen(function* () {
      const db = yield* IdbDB;
      const retries = config?.retries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const existing = yield* get();
        const partial =
          typeof update === 'function' ? update(existing.value) : update;
        if (partial === null) return existing;
        const fullValue = {
          ...existing.value,
          ...partial,
        } as ESchemaType<TSchema>;
        const encoded = yield* context.eschema
          .encode(fullValue as any)
          .pipe(
            Effect.mapError((error) =>
              IdbDBError.putFailed(context.table.storeName, error),
            ),
          );
        const _u = yield* nextUlid;
        const meta = {
          _e: context.eschema.name,
          _v: context.eschema.latestVersion,
          _u,
        };
        const write: IdbWriteOp =
          existing.meta._u === ''
            ? {
                type: 'put',
                record: {
                  ...context.key,
                  _data: encoded,
                  _e: context.eschema.name,
                  _v: context.eschema.latestVersion,
                  _u,
                  _d: false,
                } satisfies IdbRecord,
                ...(config?.lastWriteWins ? {} : { expectedU: null }),
              }
            : {
                type: 'patch',
                key: context.key,
                values: {
                  _data: encoded,
                  _v: context.eschema.latestVersion,
                  _u,
                },
                ...(config?.lastWriteWins
                  ? {}
                  : { expectedU: existing.meta._u }),
              };
        const conflicted = yield* db
          .transact(context.table.storeName, [write])
          .pipe(
            Effect.as(false),
            Effect.catchIf(
              (error) => error._tag === 'ConditionFailed',
              () => Effect.succeed(true),
            ),
          );
        if (conflicted) {
          if (attempt < retries) continue;
          return yield* Effect.fail(
            IdbDBError.conditionFailed(context.table.storeName, context.key),
          );
        }
        yield* broadcastIdbSingleEntity<TSchema>([
          { value: fullValue, meta: { ...meta, _d: false } },
        ]);
        return { value: fullValue, meta };
      }
    }).pipe(
      Effect.withSpan('idb.single-entity.get-and-update', {
        attributes: { entity: context.eschema.name },
      }),
    );

  const reset = () =>
    put(context.defaultValue).pipe(
      Effect.withSpan('idb.single-entity.reset', {
        attributes: { entity: context.eschema.name },
      }),
    );

  return { put, getAndUpdate, reset } as const;
};
