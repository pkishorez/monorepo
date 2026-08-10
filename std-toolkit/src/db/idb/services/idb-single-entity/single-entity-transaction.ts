import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect } from 'effect';
import type { IdbEntityOp, IdbEntityTable } from '../idb-entity/index.js';
import { IdbDB, IdbDBError, type IdbWriteOp } from '../idb-database/index.js';
import type {
  IdbSingleEntityContext,
  SingleEntityType,
} from './single-entity-context.js';

export const makeIdbSingleEntityTransaction = <
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
  const getAndUpdateOp = (
    update:
      | Partial<Omit<ESchemaType<TSchema>, '_v'>>
      | ((
          current: ESchemaType<TSchema>,
        ) => Partial<Omit<ESchemaType<TSchema>, '_v'>>),
    config?: { lastWriteWins?: boolean },
  ): Effect.Effect<IdbEntityOp, IdbDBError, IdbDB> =>
    Effect.gen(function* () {
      const existing = yield* get();
      if (existing.meta._u === '') {
        return yield* Effect.fail(
          IdbDBError.noItemToUpdate(context.table.storeName),
        );
      }
      const fullValue = {
        ...existing.value,
        ...(typeof update === 'function' ? update(existing.value) : update),
      } as ESchemaType<TSchema>;
      const encoded = yield* context.eschema
        .encode(fullValue as any)
        .pipe(
          Effect.mapError((error) =>
            IdbDBError.putFailed(context.table.storeName, error),
          ),
        );

      return {
        entityName: context.eschema.name,
        operationKind: 'updateOp',
        ...context.key,
        table: context.table,
        apply: (updateId) => ({
          write: {
            type: 'patch',
            key: context.key,
            values: {
              _data: encoded,
              _v: context.eschema.latestVersion,
              _u: updateId,
            },
            ...(config?.lastWriteWins ? {} : { expectedU: existing.meta._u }),
          } satisfies IdbWriteOp,
          entity: {
            value: fullValue,
            meta: {
              _e: context.eschema.name,
              _v: context.eschema.latestVersion,
              _u: updateId,
              _d: false,
            },
          },
        }),
      };
    });

  return { getAndUpdateOp } as const;
};
