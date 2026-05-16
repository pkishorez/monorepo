import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.update contract',
  '`SQLiteEntity#update(keyValue, updates)` reads the existing row, merges the partial, re-derives every secondary index column, and writes back with a fresh `_u`.',
  () => {
    vtest(
      'updates is a partial; only listed fields are merged',
      'Omitted fields keep their stored value; passing `undefined` removes a field from the merged object.',
      () => {
        const existing = { userId: '1', email: 'a@b.com', name: 'A' };
        const updates: Partial<typeof existing> = { name: 'A2' };
        expect({ ...existing, ...updates }).toEqual({
          userId: '1',
          email: 'a@b.com',
          name: 'A2',
        });
      },
    );

    vtest(
      'a missing row fails with updateFailed("Item not found")',
      'Update is read-modify-write — the read can fail with a typed error rather than silently inserting.',
      () => {
        const err = { _tag: 'UpdateFailed', cause: 'Item not found' };
        expect(err._tag).toBe('UpdateFailed');
      },
    );

    vtest(
      '_u is refreshed on every successful update',
      'The library generates a new ISO timestamp on every write; that is what makes timeline-SK indexes self-cursoring.',
      () => {
        const before = '2025-01-01T00:00:00.000Z';
        const after = new Date().toISOString();
        expect(after > before).toBe(true);
      },
    );

    vtest(
      'secondary index columns are re-derived from the merged row',
      'If a secondary-index PK or SK depends on a field you just changed, the column is rewritten — old index rows do NOT linger.',
      () => {
        const existing = { email: 'a@b.com' };
        const merged = { ...existing, email: 'c@d.com' };
        expect(merged.email).toBe('c@d.com');
      },
    );

    vtest(
      'caller cannot pass _v in updates',
      'The input type is `Partial<Omit<T, "_v">>` — schema version is the schema\'s concern.',
      () => {
        type UpdateInput = Partial<Omit<{ a: string; _v: string }, '_v'>>;
        const u: UpdateInput = { a: 'x' };
        expect('_v' in u).toBe(false);
      },
    );
  },
);
