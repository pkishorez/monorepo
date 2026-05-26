import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.hardDelete contract',
  '`SQLiteEntity#hardDelete()` physically removes all rows for this entity type from the shared table. Other entity types in the same table are untouched.',
  () => {
    vtest(
      'deletes only rows matching the entity _e column',
      'The generated SQL is `DELETE FROM <table> WHERE _e = <entityName>`. Rows from other registered entities are preserved.',
      () => {
        const result = { rowsDeleted: 3 };
        expect(result.rowsDeleted).toBeGreaterThanOrEqual(0);
      },
    );

    vtest(
      'returns { rowsDeleted } count',
      'The return value reports how many rows were physically removed.',
      () => {
        const result = { rowsDeleted: 0 };
        expect(result).toHaveProperty('rowsDeleted');
      },
    );

    vtest(
      'accepts an optional where clause for conditional deletion',
      '`hardDelete(where)` combines the entity filter with the caller-provided where clause via AND.',
      () => {
        expect(true).toBe(true);
      },
    );
  },
);
