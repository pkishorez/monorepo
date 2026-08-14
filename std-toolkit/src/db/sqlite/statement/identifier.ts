import type { TableDefinition } from '../../std-table/definition/index.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

export const tableIndexes = (table: SQLiteTable) => [
  ...Object.values(table.localSecondaryIndexes),
  ...Object.values(table.globalSecondaryIndexes),
];
