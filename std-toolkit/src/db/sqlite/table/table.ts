import type { TableDefinition } from '../../std-table/definition/index.js';
import type { StdTableContract } from '../../std-table/contract/index.js';
import type { SQLiteDriver } from '../database/index.js';
import { itemSchema } from '../item-schema/index.js';
import { queryItems } from './query.js';
import {
  deleteAllItems,
  deleteEntityItems,
  deleteItem,
  readItem,
} from './read.js';
import { writeTransaction } from './transaction.js';
import { writeItem } from './write.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const makeTableContract = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
): StdTableContract => {
  const schema = itemSchema(table);
  return {
    getItem: (key) => readItem(database, table, tableName, schema, key),
    writeItem: (request) =>
      writeItem(database, table, tableName, schema, request),
    transactWriteItems: (requests) =>
      writeTransaction(database, table, tableName, schema, requests),
    hardDeleteItem: (key) => deleteItem(database, table, tableName, key),
    hardDeleteEntityItems: (entity) =>
      deleteEntityItems(database, tableName, entity),
    hardDeleteAllItems: () => deleteAllItems(database, tableName),
    queryItems: (request) =>
      queryItems(database, table, tableName, schema, request),
  };
};
