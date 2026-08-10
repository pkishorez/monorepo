import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect } from 'effect';
import type { IdbEntityTable } from '../idb-entity/index.js';
import { IdbDB, IdbDBError, type IdbRecord } from '../idb-database/index.js';
import type {
  IdbSingleEntityContext,
  SingleEntityType,
} from './single-entity-context.js';

export const makeIdbSingleEntityReader = <
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  context: IdbSingleEntityContext<TTable, TSchema>,
) => {
  const parseRecord = (
    record: IdbRecord,
  ): Effect.Effect<SingleEntityType<ESchemaType<TSchema>>, IdbDBError, IdbDB> =>
    context.eschema.decode({ ...record._data, _v: record._v }).pipe(
      Effect.mapError((error) =>
        IdbDBError.getFailed(context.table.storeName, error),
      ),
      Effect.map((value) => ({
        value: value as ESchemaType<TSchema>,
        meta: {
          _e: record._e ?? context.eschema.name,
          _v: record._v,
          _u: record._u,
        },
      })),
    );

  const get = (): Effect.Effect<
    SingleEntityType<ESchemaType<TSchema>>,
    IdbDBError,
    IdbDB
  > =>
    Effect.gen(function* () {
      const { Item } = yield* context.table.getItem(context.key);
      if (Item) return yield* parseRecord(Item);
      return {
        value: context.defaultValue,
        meta: {
          _e: context.eschema.name,
          _v: context.eschema.latestVersion,
          _u: '',
        },
      };
    }).pipe(
      Effect.withSpan('idb.single-entity.get', {
        attributes: { entity: context.eschema.name },
      }),
    );

  return { get } as const;
};
