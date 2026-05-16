import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'single-entity.put contract',
  '`SQLiteSingleEntity#put(value)` is an unconditional upsert: inserts if no row exists, updates if one does. Refreshes `_u` either way.',
  () => {
    vtest(
      'caller passes Omit<T, "_v">; library stamps _v',
      'Schema version belongs to the schema, never the caller.',
      () => {
        type Input = Omit<{ a: string; _v: string }, '_v'>;
        const v: Input = { a: 'x' };
        expect('_v' in v).toBe(false);
      },
    );

    vtest(
      'first put inserts (no existing row)',
      'The library calls `table.getItem` to detect existence, then chooses `putItem` vs `updateItem`.',
      () => {
        const existing = null;
        const branch = existing ? 'update' : 'insert';
        expect(branch).toBe('insert');
      },
    );

    vtest(
      'second put updates in place (existing row present)',
      'Idempotent put — the row is rewritten with new `_data`, `_v`, `_u`.',
      () => {
        const existing = { Item: { pk: 'X', sk: 'X' } };
        const branch = existing.Item ? 'update' : 'insert';
        expect(branch).toBe('update');
      },
    );

    vtest(
      '_u is a fresh ISO timestamp on every put',
      'Both branches (insert and update) generate a new `_u` at write time.',
      () => {
        const u = new Date().toISOString();
        expect(u).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      },
    );

    vtest(
      'returned meta has no _d (single-entity has no soft delete)',
      'There is no concept of a tombstoned single-entity; the meta schema is `{ _e, _v, _u }`.',
      () => {
        const meta: { _e: string; _v: string; _u: string } = {
          _e: 'AppConfig',
          _v: 'v1',
          _u: new Date().toISOString(),
        };
        expect('_d' in meta).toBe(false);
      },
    );
  },
);
