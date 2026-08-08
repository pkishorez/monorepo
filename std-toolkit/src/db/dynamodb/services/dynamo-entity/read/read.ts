import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../../eschema/index.js';
import type { EntityTable as DynamoTable } from '../../../domain/entity-persistence/index.js';
import type { EntityIndex, StoredIndexDerivation } from '../entity-index.js';
import { makeEntityGet } from './get.js';
import { makeEntityQuery } from './query.js';

export const makeEntityRead = <
  TTable extends DynamoTable<any, any>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
>(
  table: TTable,
  eschema: TSchema,
  index: EntityIndex<TSecondaryDerivationMap>,
) => {
  const get = makeEntityGet<
    TTable,
    TSecondaryDerivationMap,
    TSchema,
    TPrimaryPkKeys
  >(table, eschema, index);
  const query = makeEntityQuery<
    TTable,
    TSecondaryDerivationMap,
    TSchema,
    TPrimaryPkKeys
  >(table, eschema, index);
  return { get, ...query } as const;
};
