import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import type { SQLiteEntityTable } from '../entity-table.js';
import { makeEntityGet } from './get.js';
import { makeEntityQuery } from './query.js';

export const makeEntityRead = <
  TTable extends SQLiteEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
>(
  table: TTable,
  eschema: TSchema,
  index: EntityIndex<TTable, TSecondaryDerivationMap>,
) => {
  const get = makeEntityGet<
    TTable,
    TSecondaryDerivationMap,
    TSchema,
    TPrimaryPkKeys
  >(table, eschema, index);
  return {
    get,
    ...makeEntityQuery<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(table, eschema, index),
  } as const;
};
