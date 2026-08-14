import { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import type {
  SQLiteDriver,
  SQLiteRow,
  SQLiteStatement,
} from '../database/index.js';
import { Statement } from '../statement/index.js';

type SQLiteTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const numberValue = (value: SQLiteRow[string] | undefined) =>
  typeof value === 'bigint' ? Number(value) : value;

const namedRows = (rows: readonly SQLiteRow[]) =>
  new Map(
    rows.flatMap((row) =>
      typeof row.name === 'string' ? [[row.name, row] as const] : [],
    ),
  );

const invalidBaseColumns = (table: SQLiteTable, rows: readonly SQLiteRow[]) => {
  const columns = namedRows(rows);
  const expected = [
    { name: table.primary.pk, type: 'TEXT', primary: 1 },
    { name: table.primary.sk, type: 'TEXT', primary: 2 },
    { name: '_e', type: 'TEXT', primary: 0 },
    { name: '_v', type: 'TEXT', primary: 0 },
    { name: '_u', type: 'TEXT', primary: 0 },
    { name: '_d', type: 'INTEGER', primary: 0 },
    { name: 'data', type: 'TEXT', primary: 0 },
  ];
  return expected.flatMap(({ name, type, primary }) => {
    const column = columns.get(name);
    return column === undefined ||
      typeof column.type !== 'string' ||
      column.type.toUpperCase() !== type ||
      numberValue(column.notnull) !== 1 ||
      numberValue(column.pk) !== primary
      ? [name]
      : [];
  });
};

const invalidIndexColumns = (
  table: SQLiteTable,
  tableName: string,
  rows: readonly SQLiteRow[],
) => {
  const columns = namedRows(rows);
  const primary = new Set([table.primary.pk, table.primary.sk]);
  const expected = new Set(
    Statement.indexDefinitions(tableName, table).flatMap(
      ({ columns: names }) => names,
    ),
  );
  return [...expected].flatMap((name) => {
    if (primary.has(name)) return [];
    const column = columns.get(name);
    if (column === undefined) return [];
    return typeof column.type !== 'string' ||
      column.type.toUpperCase() !== 'TEXT' ||
      numberValue(column.notnull) !== 0 ||
      numberValue(column.pk) !== 0 ||
      column.dflt_value !== null
      ? [name]
      : [];
  });
};

const unsupportedRequiredColumns = (
  table: SQLiteTable,
  tableName: string,
  rows: readonly SQLiteRow[],
) => {
  const known = new Set([
    table.primary.pk,
    table.primary.sk,
    '_e',
    '_v',
    '_u',
    '_d',
    'data',
    ...Statement.indexDefinitions(tableName, table).flatMap(
      ({ columns }) => columns,
    ),
  ]);
  return rows.flatMap((row) =>
    typeof row.name === 'string' &&
    !known.has(row.name) &&
    numberValue(row.notnull) === 1 &&
    row.dflt_value === null
      ? [row.name]
      : [],
  );
};

const hasExpectedIndexKeys = (
  rows: readonly SQLiteRow[],
  columns: readonly string[],
) => {
  const keys = rows
    .filter((row) => numberValue(row.key) === 1)
    .toSorted(
      (left, right) =>
        Number(numberValue(left.seqno)) - Number(numberValue(right.seqno)),
    );
  return (
    keys.length === columns.length &&
    keys.every(
      (row, index) =>
        row.name === columns[index] &&
        numberValue(row.desc) === 0 &&
        row.coll === 'BINARY',
    )
  );
};

const inspectSQLiteTopology = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  Effect.gen(function* () {
    const tableInfo = Statement.tableInfo(tableName);
    const columns = yield* database.all(tableInfo.sql);
    const invalidBase = invalidBaseColumns(table, columns);
    if (invalidBase.length > 0)
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has an incompatible base schema: ${invalidBase.join(', ')}`,
        ),
      );
    const invalidIndexes = invalidIndexColumns(table, tableName, columns);
    if (invalidIndexes.length > 0)
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has incompatible index columns: ${invalidIndexes.join(', ')}`,
        ),
      );
    const unsupported = unsupportedRequiredColumns(table, tableName, columns);
    if (unsupported.length > 0)
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has unsupported required columns: ${unsupported.join(', ')}`,
        ),
      );

    const indexList = Statement.indexList(tableName);
    const listedIndexes = yield* database.all(indexList.sql);
    const primary = listedIndexes.find((row) => row.origin === 'pk');
    if (
      primary === undefined ||
      typeof primary.name !== 'string' ||
      numberValue(primary.unique) !== 1 ||
      numberValue(primary.partial) !== 0
    )
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has an incompatible primary index`,
        ),
      );
    const primaryInfo = Statement.indexInfo(primary.name);
    const primaryRows = yield* database.all(primaryInfo.sql);
    if (
      !hasExpectedIndexKeys(primaryRows, [table.primary.pk, table.primary.sk])
    )
      return yield* Effect.fail(
        new Error(
          `SQLite table "${tableName}" has an incompatible primary index`,
        ),
      );

    const definitions = Statement.indexDefinitions(tableName, table);
    const foldedNames = new Set<string>();
    for (const { name } of definitions) {
      const folded = name.toLowerCase();
      if (foldedNames.has(folded))
        return yield* Effect.fail(
          new Error(
            `SQLite table "${tableName}" has colliding physical index names`,
          ),
        );
      foldedNames.add(folded);
    }
    const listedByName = new Map(
      listedIndexes.flatMap((row) =>
        typeof row.name === 'string'
          ? [[row.name.toLowerCase(), row] as const]
          : [],
      ),
    );
    for (const listed of listedIndexes) {
      if (
        listed.origin !== 'pk' &&
        numberValue(listed.unique) === 1 &&
        typeof listed.name === 'string' &&
        !foldedNames.has(listed.name.toLowerCase())
      )
        return yield* Effect.fail(
          new Error(
            `SQLite table "${tableName}" has an undeclared unique index "${listed.name}"`,
          ),
        );
    }
    const mutations: SQLiteStatement[] = Statement.findMissingColumns(
      table,
      columns,
    ).map((definition) => Statement.addColumn(tableName, definition));
    for (const expected of definitions) {
      const listed = listedByName.get(expected.name.toLowerCase());
      if (listed === undefined) {
        const ownerStatement = Statement.indexOwner(expected.name);
        const ownerRows = yield* database.all(
          ownerStatement.sql,
          ownerStatement.parameters,
        );
        const owner = ownerRows.at(0)?.tbl_name;
        if (owner !== undefined)
          return yield* Effect.fail(
            new Error(
              `SQLite index "${expected.name}" belongs to table "${String(owner)}"`,
            ),
          );
        mutations.push(expected.create);
        continue;
      }
      if (typeof listed.name !== 'string')
        return yield* Effect.fail(
          new Error(`SQLite index "${expected.name}" has no physical name`),
        );
      const infoStatement = Statement.indexInfo(listed.name);
      const info = yield* database.all(infoStatement.sql);
      const compatible =
        listed.origin === 'c' &&
        numberValue(listed.unique) === 0 &&
        numberValue(listed.partial) === 0 &&
        hasExpectedIndexKeys(info, expected.columns);
      if (!compatible)
        mutations.push(Statement.dropIndex(listed.name), expected.create);
    }
    return mutations;
  });

export const reconcileSQLiteTopology = (
  database: SQLiteDriver,
  table: SQLiteTable,
  tableName: string,
) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 3; attempt++) {
      const mutations = yield* inspectSQLiteTopology(
        database,
        table,
        tableName,
      );
      if (mutations.length === 0) return;
      const applied = yield* database
        .transaction(mutations)
        .pipe(Effect.result);
      const remaining = yield* inspectSQLiteTopology(
        database,
        table,
        tableName,
      );
      if (remaining.length === 0) return;
      if (applied._tag === 'Failure' && attempt === 2)
        return yield* Effect.fail(applied.failure);
      yield* Effect.yieldNow;
    }
    return yield* Effect.fail(
      new Error(`SQLite setup for table "${tableName}" did not converge`),
    );
  });
