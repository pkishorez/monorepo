import type { TableDefinition } from '../../std-table/definition/index.js';
import { quoteIdentifier, tableIndexes } from './identifier.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export const indexColumnNames = (table: SQLiteTable) => {
  const primary = new Set([table.primary.pk, table.primary.sk]);
  return [
    ...new Set(tableIndexes(table).flatMap(({ pk, sk }) => [pk, sk])),
  ].filter((name) => !primary.has(name));
};

export const tableColumnDefinitions = (table: SQLiteTable) => {
  return [
    `${quoteIdentifier(table.primary.pk)} TEXT NOT NULL`,
    `${quoteIdentifier(table.primary.sk)} TEXT NOT NULL`,
    '_e TEXT NOT NULL',
    '_v TEXT NOT NULL',
    '_u TEXT NOT NULL',
    '_d INTEGER NOT NULL CHECK (_d IN (0, 1))',
    'data TEXT NOT NULL',
    ...indexColumnNames(table).map((name) => `${quoteIdentifier(name)} TEXT`),
    `PRIMARY KEY (${quoteIdentifier(table.primary.pk)}, ${quoteIdentifier(table.primary.sk)})`,
  ];
};
