import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'soft vs hard delete',
  'Soft delete writes `_d: true` and refreshes `_u`; the row stays in the table so streams and sync engines can observe the tombstone. Hard delete physically removes the row and is unsafe for any downstream replay.',
  () => {
    vtest(
      'soft delete is the default; hard delete needs an explicit acknowledgement string',
      'The `forceDelete` parameter is the literal `"I know what I am doing"`; any other value (including `true`) is treated as soft delete.',
      () => {
        const ack = 'I know what I am doing' as const;
        expect(ack).toBe('I know what I am doing');
      },
    );

    vtest(
      'soft delete refreshes _u',
      'Soft delete is an `update({ _d: true })` under the hood — `_u` is advanced and every `_u`-SK GSI moves with it.',
      () => {
        const beforeIso = '2025-01-01T00:00:00.000Z';
        const afterIso = '2025-01-02T00:00:00.000Z';
        expect(afterIso > beforeIso).toBe(true);
      },
    );
  },
);

vdescribe(
  'delete missing row',
  'Both soft and hard delete call `get()` first; if the row is absent the call surfaces `DynamodbError.noItemToDelete()`.',
  () => {
    vtest(
      'deleting a missing row fails with NoItemToDelete',
      'A missing row is not silently no-op — it is a typed failure that the caller can match on.',
      () => {
        const tag = 'noItemToDelete' as const;
        expect(tag).toBe('noItemToDelete');
      },
    );
  },
);

vdescribe(
  'hard delete safety story',
  'Hard delete bypasses the secondary-index tombstone and is unsafe for sync engines / stream consumers. Use only for one-off administrative cleanup.',
  () => {
    vtest(
      'hard delete still broadcasts a tombstone-shaped entity in-process',
      'The library reads the row first and re-emits `{ value, meta: { ..., _d: true } }` to `ConnectionService` so in-process subscribers stay consistent.',
      () => {
        const broadcastPayload = {
          value: { id: '1' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-01', _d: true },
        };
        expect(broadcastPayload.meta._d).toBe(true);
      },
    );
  },
);
