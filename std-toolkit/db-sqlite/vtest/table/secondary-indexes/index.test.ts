import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';
import { SQLiteTable } from '@std-toolkit/sqlite';

vdescribe(
  'table.secondary-indexes contract',
  '`.index(name, pkCol, skCol)` registers a column pair; `table.index(name).query(...)` queries against it. The library adds the columns and the SQLite index during `setup()`.',
  () => {
    vtest(
      'index name is independent of pk / sk column names',
      'The first arg is a logical name (used by entities to refer to the index); the next two are the physical column names.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .index('byEmail', 'IDX1PK', 'IDX1SK')
          .build();
        expect(t.secondaryIndexMap.byEmail).toEqual({
          pk: 'IDX1PK',
          sk: 'IDX1SK',
        });
      },
    );

    vtest(
      'multiple indexes accumulate in a typed map',
      'The builder is fully typed: each `.index(...)` widens `secondaryIndexMap` so downstream code can refer to the index by name without a cast.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .index('IDX1', 'IDX1PK', 'IDX1SK')
          .index('IDX2', 'IDX2PK', 'IDX2SK')
          .build();
        expect(Object.keys(t.secondaryIndexMap).sort()).toEqual([
          'IDX1',
          'IDX2',
        ]);
      },
    );

    vtest(
      'index(name) returns an object with a .query method',
      'The accessor is the only way to reach secondary-index queries at the table layer.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .index('IDX1', 'IDX1PK', 'IDX1SK')
          .build();
        const accessor = t.index('IDX1');
        expect(typeof accessor.query).toBe('function');
      },
    );

    vtest(
      'index(name) throws synchronously for unknown name',
      'Wrong name is a programmer error; surfaced at the call site, not as a SQL error.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .build();
        expect(() => t.index('does-not-exist' as never)).toThrow(/not found/);
      },
    );
  },
);
