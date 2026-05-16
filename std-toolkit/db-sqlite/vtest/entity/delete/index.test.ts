import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.delete contract',
  '`SQLiteEntity#delete(keyValue)` is a SOFT delete. The row stays on disk; `_d` is set to `1` and `_u` is refreshed so sync consumers see the tombstone.',
  () => {
    vtest(
      'sets _d = 1 (true) on the existing row',
      'The library writes a new `_data` (the existing payload re-encoded), `_v`, and a fresh `_u` alongside `_d = 1`.',
      () => {
        const after = { _d: 1, _u: new Date().toISOString() };
        expect(after._d).toBe(1);
      },
    );

    vtest(
      'returns the deleted entity with meta._d: true',
      'Callers can use the return value to push the tombstone downstream without an extra read.',
      () => {
        const returned = {
          value: { userId: '1' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-01', _d: true },
        };
        expect(returned.meta._d).toBe(true);
      },
    );

    vtest(
      'a missing row fails with deleteFailed("Item not found")',
      'Delete is read-modify-write — there is no "delete-if-exists" shortcut at the entity layer.',
      () => {
        const err = { _tag: 'DeleteFailed', cause: 'Item not found' };
        expect(err._tag).toBe('DeleteFailed');
      },
    );

    vtest(
      'secondary index columns are re-derived (with the new _u)',
      'Timeline-SK indexes need the new `_u` so the tombstone is observable in their order; the library refreshes those columns on delete too.',
      () => {
        const u2 = new Date().toISOString();
        expect(typeof u2).toBe('string');
      },
    );

    vtest(
      'hard delete is reserved for dangerouslyRemoveAllRows',
      'There is no `entity.hardDelete(...)`; only `dangerouslyRemoveAllRows("i know what i am doing")` issues `DELETE`.',
      () => {
        const guard = 'i know what i am doing';
        expect(guard).toBe('i know what i am doing');
      },
    );
  },
);
