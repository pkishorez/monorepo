import type { TableDefinition } from '../../std-table/definition/index.js';
import type {
  EncodedKey,
  ItemCondition,
  QueryRequest,
} from '../../std-table/contract/index.js';
import type { SQLiteRow, SQLiteValue } from '../item-schema/index.js';
import { quoteIdentifier, tableIndexes } from './identifier.js';
import { selectPage } from './query.js';
import { indexColumnNames, tableColumnDefinitions } from './schema.js';
import { conflictClause } from './write.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

interface QueryCursor {
  readonly indexSk: string;
  readonly pk: string;
  readonly sk: string;
}

const makeWriteStatement = (
  tableName: string,
  table: SQLiteTable,
  row: SQLiteRow,
  condition: ItemCondition | undefined,
) => {
  const names = Object.keys(row);
  const values: SQLiteValue[] = Object.values(row);
  const quoted = quoteIdentifier(tableName);
  const columns = names.map(quoteIdentifier).join(', ');
  const placeholders = names.map(() => '?').join(', ');
  const conflict = `ON CONFLICT(${quoteIdentifier(table.primary.pk)}, ${quoteIdentifier(table.primary.sk)})${conflictClause(names, table.primary, condition)}`;

  // A bare upsert would resurrect a row deleted since it was read, so guard on existence.
  if (condition?.kind === 'updated' || condition?.kind === 'exists') {
    const version = condition.kind === 'updated' ? ' AND _u = ?' : '';
    return {
      sql: `INSERT INTO ${quoted} (${columns}) SELECT ${placeholders} WHERE EXISTS (SELECT 1 FROM ${quoted} WHERE ${quoteIdentifier(table.primary.pk)} = ? AND ${quoteIdentifier(table.primary.sk)} = ?${version}) ${conflict}`,
      parameters: [
        ...values,
        row[table.primary.pk] ?? null,
        row[table.primary.sk] ?? null,
        ...(condition.kind === 'updated' ? [condition.value] : []),
      ],
      expectedChanges: 1,
    };
  }

  return {
    sql: `INSERT INTO ${quoted} (${columns}) VALUES (${placeholders}) ${conflict}`,
    parameters: values,
    ...(condition === undefined ? {} : { expectedChanges: 1 }),
  };
};

// A no-op self-update makes `changes` report the condition result, so a check
// needs no statement kind the drivers do not already run.
const makeCheckStatement = (
  tableName: string,
  table: SQLiteTable,
  key: EncodedKey,
  condition: ItemCondition,
) => {
  const where = `${quoteIdentifier(table.primary.pk)} = ? AND ${quoteIdentifier(table.primary.sk)} = ?`;
  const sql = `UPDATE ${quoteIdentifier(tableName)} SET _u = _u WHERE ${where}`;
  if (condition.kind === 'updated')
    return {
      sql: `${sql} AND _u = ?`,
      parameters: [key.pk, key.sk, condition.value],
      expectedChanges: 1,
    };
  return {
    sql,
    parameters: [key.pk, key.sk],
    expectedChanges: condition.kind === 'exists' ? 1 : 0,
  };
};

const makeGetStatement = (tableName: string, table: SQLiteTable) => ({
  sql: `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(table.primary.pk)} = ? AND ${quoteIdentifier(table.primary.sk)} = ?`,
});

const makeHardDeleteStatement = (tableName: string, table: SQLiteTable) => ({
  sql: `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(table.primary.pk)} = ? AND ${quoteIdentifier(table.primary.sk)} = ?`,
});

const makeDeleteEntityStatement = (tableName: string) => ({
  sql: `DELETE FROM ${quoteIdentifier(tableName)} WHERE _e = ?`,
});

const makeDeleteAllStatement = (tableName: string) => ({
  sql: `DELETE FROM ${quoteIdentifier(tableName)}`,
});

const makeQueryStatement = (
  tableName: string,
  table: SQLiteTable,
  request: QueryRequest,
  cursor: QueryCursor | undefined,
) => {
  const index =
    request.index === undefined
      ? table.primary
      : (table.localSecondaryIndexes[request.index] ??
        table.globalSecondaryIndexes[request.index]);
  if (index === undefined) throw new Error(`Unknown index "${request.index}"`);
  return selectPage(
    tableName,
    request,
    index.pk,
    index.sk,
    table.primary.pk,
    table.primary.sk,
    cursor,
  );
};

const makeCreateTableStatement = (tableName: string, table: SQLiteTable) => {
  const columns = tableColumnDefinitions(table);
  return {
    sql: `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (${columns.join(', ')})`,
  };
};

const makeTableInfoStatement = (tableName: string) => ({
  sql: `PRAGMA table_info(${quoteIdentifier(tableName)})`,
});

const makeIndexListStatement = (tableName: string) => ({
  sql: `PRAGMA index_list(${quoteIdentifier(tableName)})`,
});

const makeIndexInfoStatement = (indexName: string) => ({
  sql: `PRAGMA index_xinfo(${quoteIdentifier(indexName)})`,
});

const makeIndexOwnerStatement = (indexName: string) => ({
  sql: `SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ? COLLATE NOCASE`,
  parameters: [indexName] as const,
});

const makeAddColumnStatement = (tableName: string, definition: string) => ({
  sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${definition}`,
});

const makeDropIndexStatement = (indexName: string) => ({
  sql: `DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`,
});

const findMissingColumnDefinitions = (
  table: SQLiteTable,
  rows: readonly SQLiteRow[],
) => {
  const existing = new Set(
    rows.flatMap((row) => (typeof row.name === 'string' ? [row.name] : [])),
  );
  return indexColumnNames(table)
    .filter((name) => !existing.has(name))
    .map((name) => `${quoteIdentifier(name)} TEXT`);
};

const makeIndexDefinitions = (tableName: string, table: SQLiteTable) =>
  tableIndexes(table).map((index) => {
    const name = `idx_${tableName}_${index.name}`;
    return {
      name,
      columns: [index.pk, index.sk] as const,
      create: {
        sql: `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(name)} ON ${quoteIdentifier(tableName)} (${quoteIdentifier(index.pk)}, ${quoteIdentifier(index.sk)})`,
      },
    };
  });

const makeCreateIndexStatements = (tableName: string, table: SQLiteTable) =>
  makeIndexDefinitions(tableName, table).map(({ create }) => create);

export const Statement = {
  addColumn: makeAddColumnStatement,
  check: makeCheckStatement,
  createIndexes: makeCreateIndexStatements,
  createTable: makeCreateTableStatement,
  deleteAll: makeDeleteAllStatement,
  deleteEntity: makeDeleteEntityStatement,
  findMissingColumns: findMissingColumnDefinitions,
  get: makeGetStatement,
  hardDelete: makeHardDeleteStatement,
  indexDefinitions: makeIndexDefinitions,
  indexInfo: makeIndexInfoStatement,
  indexList: makeIndexListStatement,
  indexOwner: makeIndexOwnerStatement,
  query: makeQueryStatement,
  dropIndex: makeDropIndexStatement,
  tableInfo: makeTableInfoStatement,
  write: makeWriteStatement,
} as const;
