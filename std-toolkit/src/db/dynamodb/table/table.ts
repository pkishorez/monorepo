import type { TableDefinition } from '../../std-table/definition/index.js';
import type { StdTableContract } from '../../std-table/contract/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { itemSchema } from '../item-schema/index.js';
import {
  hardDeleteAllItems,
  hardDeleteEntityItems,
  hardDeleteItem,
} from './delete.js';
import { queryItems } from './query.js';
import { getItem } from './read.js';
import { transactWriteItems, writeItem } from './write.js';

export const makeTableContract = (
  client: DynamoDBClient,
  table: Pick<
    TableDefinition,
    'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  tableName: string,
): StdTableContract => {
  const schema = itemSchema(table);
  return {
    getItem: (key) => getItem(client, table, tableName, schema, key),
    queryItems: (request) =>
      queryItems(client, table, tableName, schema, request),
    writeItem: (request) =>
      writeItem(client, table, tableName, schema, request),
    transactWriteItems: (requests) =>
      transactWriteItems(client, table, tableName, schema, requests),
    hardDeleteItem: (key) => hardDeleteItem(client, table, tableName, key),
    hardDeleteEntityItems: (entity) =>
      hardDeleteEntityItems(client, table, tableName, entity),
    hardDeleteAllItems: () => hardDeleteAllItems(client, table, tableName),
  };
};
