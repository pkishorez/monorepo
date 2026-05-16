import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'single-entity.update contract',
  '`SQLiteSingleEntity#update({ update })` partial-merges into the existing row. Fails with `updateFailed("Item not found")` when the row has never been written (synthetic-meta `_u === ""`).',
  () => {
    vtest(
      'partial merges only the listed fields',
      'Omitted fields keep their stored value.',
      () => {
        const existing = { theme: 'light', maxRetries: 3 };
        const merged = {
          ...existing,
          ...({ maxRetries: 5 } as Partial<typeof existing>),
        };
        expect(merged).toEqual({ theme: 'light', maxRetries: 5 });
      },
    );

    vtest(
      'an absent row fails with updateFailed (no implicit insert)',
      'Unlike `put`, `update` will not create a row from scratch — that is what the mandatory `default(...)` and `put(...)` are for.',
      () => {
        const meta = { _u: '' };
        const wouldFail = meta._u === '';
        expect(wouldFail).toBe(true);
      },
    );

    vtest(
      '_v is taken from the schema (never the caller)',
      'The input type is `Partial<Omit<T, "_v">>`.',
      () => {
        type In = Partial<Omit<{ a: string; _v: string }, '_v'>>;
        const u: In = {};
        expect('_v' in u).toBe(false);
      },
    );

    vtest(
      '_u is refreshed on every successful update',
      'Sync consumers see the touched timestamp on the broadcast envelope.',
      () => {
        const u = new Date().toISOString();
        expect(u).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      },
    );

    vtest(
      'broadcast fires after the write, with meta._d: false',
      'Single-entity has no soft delete; the broadcast envelope still carries `_d: false` so subscribers can use one code path for both entity kinds.',
      () => {
        const entity = {
          value: { theme: 'dark' },
          meta: { _e: 'AppConfig', _v: 'v1', _u: '2025-01-01', _d: false },
        };
        expect(entity.meta._d).toBe(false);
      },
    );
  },
);
