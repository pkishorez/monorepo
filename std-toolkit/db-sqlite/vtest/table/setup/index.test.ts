import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';
import { SQLiteTable } from '@std-toolkit/sqlite';

vdescribe(
  'table.setup contract',
  '`SQLiteTable#setup()` is the one-call lifecycle that creates the shared table and any registered secondary index columns / SQLite indexes. It is idempotent and additive — safe to run on every boot.',
  () => {
    vtest(
      'composite primary key is (pk, sk)',
      'Every row is keyed by `(pk, sk)`. The names are configurable on the builder; the rest of the library is hard-wired to two-column keys.',
      () => {
        const table = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .build();
        expect(table.primary).toEqual({ pk: 'pk', sk: 'sk' });
      },
    );

    vtest(
      'secondary index columns are derived from .index(name, pk, sk)',
      'Each call to `.index(name, pkCol, skCol)` registers a column pair the entity layer can write into; the column names are the strings you passed.',
      () => {
        const table = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .index('IDX1', 'IDX1PK', 'IDX1SK')
          .index('IDX2', 'IDX2PK', 'IDX2SK')
          .build();
        expect(table.secondaryIndexMap).toEqual({
          IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' },
          IDX2: { pk: 'IDX2PK', sk: 'IDX2SK' },
        });
      },
    );

    vtest(
      'tableName is exposed for error messages and RPC routing',
      'Errors raised by every operation embed the table name; the registry and command processor use it for diagnostics.',
      () => {
        const table = SQLiteTable.make({ tableName: 'std_data' })
          .primary('pk', 'sk')
          .build();
        expect(table.tableName).toBe('std_data');
      },
    );

    vtest(
      'setup() is an Effect, never a thunk',
      'You can compose it inside `Effect.gen`, retry it, or pipe a layer — it is _not_ run on `.build()`.',
      () => {
        const table = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .build();
        const effect = table.setup();
        expect(typeof effect).toBe('object');
        expect(effect).not.toBeNull();
      },
    );

    vtest(
      'index() throws synchronously for an unknown name',
      'The library catches typos at the call site rather than letting them surface as a SQLite error later.',
      () => {
        const table = SQLiteTable.make({ tableName: 't' })
          .primary('pk', 'sk')
          .build();
        expect(() => table.index('NOPE' as never)).toThrow(/not found/);
      },
    );
  },
);
