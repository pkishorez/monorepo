import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import { Schema } from 'effect';
import type {
  QueryRequest,
  EncodedItem,
} from '../../std-table/contract/index.js';
import { itemSchema } from '../item-schema/index.js';
import { Statement } from '../statement/index.js';

const table = StdTable.make('items')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const item: EncodedItem = {
  pk: 'tenant',
  sk: 'item',
  meta: { _e: 'Item', _v: 'v2', _u: 'v2', _d: false },
  data: { name: 'example' },
  keys: { GSI1PK: 'group', GSI1SK: 'rank' },
};

const query = (
  sort: QueryRequest['sort'],
  descending = false,
): QueryRequest => ({
  pk: 'tenant',
  descending,
  limit: 10,
  ...(sort === undefined ? {} : { sort }),
});

describe('SQLite private statement construction', () => {
  it.each(['=', '<', '<=', '>', '>='] as const)(
    'binds the %s sort operator',
    (operator) => {
      const statement = Statement.query(
        'items',
        table,
        query({ operator, value: 'middle' }),
        undefined,
      );

      expect(statement.sql).toContain(`"sk" ${operator} ?`);
      expect(statement.parameters).toEqual(['tenant', 'middle', 11]);
    },
  );

  it('binds both between boundaries', () => {
    const statement = Statement.query(
      'items',
      table,
      query({ operator: 'between', value: ['a', 'z'] }),
      undefined,
    );

    expect(statement.sql).toContain('"sk" BETWEEN ? AND ?');
    expect(statement.parameters).toEqual(['tenant', 'a', 'z', 11]);
  });

  it('matches beginsWith with a binary range instead of a case-folding LIKE', () => {
    const statement = Statement.query(
      'items',
      table,
      query({ operator: 'beginsWith', value: String.raw`a%b_c\d` }),
      undefined,
    );

    expect(statement.sql).toContain('"sk" >= ?');
    expect(statement.sql).toContain('"sk" < ?');
    expect(statement.sql).not.toContain('LIKE');
    expect(statement.parameters).toEqual([
      'tenant',
      String.raw`a%b_c\d`,
      String.raw`a%b_c\e`,
      11,
    ]);
  });

  it.each([
    [false, '>'],
    [true, '<'],
  ] as const)('uses a stable %s keyset direction', (descending, comparison) => {
    const statement = Statement.query(
      'items',
      table,
      query(undefined, descending),
      {
        indexSk: 'cursor-sort',
        pk: 'cursor-pk',
        sk: 'cursor-sk',
      },
    );
    const direction = descending ? 'DESC' : 'ASC';

    expect(statement.sql).toContain(
      `("sk", "pk", "sk") ${comparison} (?, ?, ?)`,
    );
    expect(statement.sql).toContain(
      `ORDER BY "sk" ${direction}, "pk" ${direction}, "sk" ${direction}`,
    );
    expect(statement.parameters).toEqual([
      'tenant',
      'cursor-sort',
      'cursor-pk',
      'cursor-sk',
      11,
    ]);
  });

  it('builds an atomic insert-if-absent statement', () => {
    const row = Schema.decodeSync(itemSchema(table))(item);
    const statement = Statement.write('items', table, row, {
      kind: 'not-exists',
    });

    expect(statement.sql).toContain('ON CONFLICT("pk", "sk") DO NOTHING');
    expect(statement.expectedChanges).toBe(1);
    expect(statement.parameters).not.toContain('v1');
  });

  it('builds an atomic version-checked upsert statement', () => {
    const row = Schema.decodeSync(itemSchema(table))(item);
    const statement = Statement.write('items', table, row, {
      kind: 'updated',
      value: 'v1',
    });

    expect(statement.sql).toContain('DO UPDATE SET');
    expect(statement.sql).toContain(
      'WHERE EXISTS (SELECT 1 FROM "items" WHERE "pk" = ? AND "sk" = ? AND _u = ?)',
    );
    expect(statement.expectedChanges).toBe(1);
    expect(statement.parameters.at(-1)).toBe('v1');
  });

  it('excludes primary-key columns from the upsert assignment by name', () => {
    const numeric = StdTable.make('numeric')
      .primary('a', 'b')
      .gsi('GSI1', '0', '1')
      .build();
    const row = Schema.decodeSync(itemSchema(numeric))({
      ...item,
      keys: { 0: 'group', 1: 'rank' },
    });
    const statement = Statement.write('numeric', numeric, row, undefined);

    const assignments = statement.sql.slice(
      statement.sql.indexOf('DO UPDATE SET'),
    );
    expect(assignments).not.toContain('"a" = excluded."a"');
    expect(assignments).not.toContain('"b" = excluded."b"');
    expect(assignments).toContain('"0" = excluded."0"');
    expect(assignments).toContain('"1" = excluded."1"');
    expect(assignments).toContain('"data" = excluded."data"');
  });

  it('quotes schema identifiers and finds only missing migration columns', () => {
    const create = Statement.createTable('odd"table', table);
    const addColumn = Statement.addColumn('odd"table', '"GSI1PK" TEXT');
    const dropIndex = Statement.dropIndex('idx_odd"table_GSI1');
    const indexInfo = Statement.indexInfo('idx_odd"table_GSI1');
    const indexList = Statement.indexList('odd"table');
    const indexOwner = Statement.indexOwner('idx_odd"table_GSI1');
    const indexes = Statement.createIndexes('odd"table', table);
    const missing = Statement.findMissingColumns(table, [{ name: 'GSI1PK' }]);

    expect(create.sql).toContain('CREATE TABLE IF NOT EXISTS "odd""table"');
    expect(create.sql).toContain('"GSI1PK" TEXT');
    expect(addColumn.sql).toBe(
      'ALTER TABLE "odd""table" ADD COLUMN "GSI1PK" TEXT',
    );
    expect(dropIndex.sql).toBe('DROP INDEX IF EXISTS "idx_odd""table_GSI1"');
    expect(indexInfo.sql).toBe('PRAGMA index_xinfo("idx_odd""table_GSI1")');
    expect(indexList.sql).toBe('PRAGMA index_list("odd""table")');
    expect(indexOwner.parameters).toEqual(['idx_odd"table_GSI1']);
    expect(indexes[0]?.sql).toContain('"idx_odd""table_GSI1"');
    expect(missing).toEqual(['"GSI1SK" TEXT']);
  });
});
