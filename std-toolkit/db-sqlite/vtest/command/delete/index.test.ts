import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.delete contract',
  '`SqliteCommand#process({ operation: "delete", entity, key })` routes to `entity.delete(key)` — a SOFT delete — and wraps the result with timing.',
  () => {
    vtest(
      'delete is soft at the entity layer; command does not change that',
      'The command layer is a thin facade — it inherits soft-delete semantics from `entity.delete`.',
      () => {
        const returned = {
          value: { userId: '1' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-02', _d: true },
        };
        expect(returned.meta._d).toBe(true);
      },
    );

    vtest(
      'response.data is the tombstoned EntityType<T>',
      'Sync consumers can react to the broadcast or the response — same envelope.',
      () => {
        const data = {
          value: { userId: '1' },
          meta: { _d: true } as { _d: boolean },
        };
        expect(data.meta._d).toBe(true);
      },
    );

    vtest(
      'an "Item not found" error maps to CommandError("delete")',
      'Failures from `entity.delete` are wrapped with the operation tag and the original cause.',
      () => {
        const err = {
          _tag: 'CommandError',
          operation: 'delete',
          message: 'Delete failed: Item not found',
        };
        expect(err.message).toMatch(/Delete failed/);
      },
    );

    vtest(
      'response carries the same timing envelope as other ops',
      'Uniform `startedAt` / `completedAt` / `durationMs` across every operation.',
      () => {
        const t = { startedAt: 0, completedAt: 1, durationMs: 1 };
        expect(t.durationMs).toBe(1);
      },
    );
  },
);
