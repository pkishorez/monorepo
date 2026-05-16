import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';
import { SQLiteTable } from '@std-toolkit/sqlite';

vdescribe(
  'table.primary-key contract',
  'Every row in a `SQLiteTable` is keyed by a composite `(pk, sk)` primary key. The names are configurable; the shape is not.',
  () => {
    vtest(
      'primary() requires both column names',
      'You cannot construct a table without an explicit `(pk, sk)` declaration — there is no default.',
      () => {
        const make = SQLiteTable.make({ tableName: 't' });
        expect(typeof make.primary).toBe('function');
        const built = make.primary('pk', 'sk').build();
        expect(built.primary.pk).toBe('pk');
        expect(built.primary.sk).toBe('sk');
      },
    );

    vtest(
      'column names are propagated verbatim, not normalised',
      'The strings you pass to `.primary(...)` are the SQLite column names. Choose ones SQLite accepts.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('partition', 'sort')
          .build();
        expect(t.primary).toEqual({ pk: 'partition', sk: 'sort' });
      },
    );

    vtest(
      'getItem / updateItem / deleteItem all take { pk, sk }',
      'Item-level operations key by the composite — there is no other way to address a row.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .build();
        expect(typeof t.getItem).toBe('function');
        expect(typeof t.updateItem).toBe('function');
        expect(typeof t.deleteItem).toBe('function');
      },
    );

    vtest(
      'deleteItem on the table is a SOFT delete',
      '`SQLiteTable#deleteItem` updates `_d = 1`, never issues `DELETE`. Hard removal is `dangerouslyRemoveAllRows`.',
      () => {
        const t = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .build();
        expect(typeof t.dangerouslyRemoveAllRows).toBe('function');
      },
    );
  },
);
