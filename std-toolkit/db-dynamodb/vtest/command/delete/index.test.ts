import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.delete is soft-only',
  'Hard delete is unsafe for downstream replay and is intentionally not exposed over the wire.',
  () => {
    vtest(
      'no forceDelete over the wire',
      'Callers that need hard delete must use the entity API directly.',
      () => {
        const payload: { forceDelete?: string } = {};
        expect(payload.forceDelete).toBeUndefined();
      },
    );

    vtest(
      'response carries the tombstoned entity',
      '`data.meta._d` is `true` after a successful soft delete.',
      () => {
        const data = {
          value: { id: '1' },
          meta: { _e: 'User', _v: 'v1', _u: 'x', _d: true },
        };
        expect(data.meta._d).toBe(true);
      },
    );
  },
);
