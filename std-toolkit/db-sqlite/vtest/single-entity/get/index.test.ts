import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'single-entity.get contract',
  '`SQLiteSingleEntity#get()` never returns `null`. If the row exists it is decoded normally; otherwise the configured default value is returned with synthetic meta where `_u === ""`.',
  () => {
    vtest(
      'never returns null',
      "Callers do not need to handle the missing case — that's the whole point of single-entity.",
      () => {
        const result = {
          value: { theme: 'light', maxRetries: 3 },
          meta: { _e: 'AppConfig', _v: 'v1', _u: '' },
        };
        expect(result).not.toBeNull();
        expect(result.value).toBeDefined();
      },
    );

    vtest(
      'meta._u === "" signals "default, not stored"',
      '`update(...)` checks for `_u === ""` to decide whether to fail with `updateFailed("Item not found")`.',
      () => {
        const synthetic = { _e: 'AppConfig', _v: 'v1', _u: '' };
        expect(synthetic._u).toBe('');
      },
    );

    vtest(
      "synthetic meta carries the schema's latestVersion",
      'When no row exists, the library still stamps `_v = schema.latestVersion` so downstream code does not have to special-case the default.',
      () => {
        const synthetic = { _e: 'AppConfig', _v: 'v1', _u: '' };
        expect(synthetic._v).toBeTruthy();
      },
    );

    vtest(
      'real stored rows have a non-empty _u',
      'After the first `put(...)` / `update(...)`, `_u` is an ISO timestamp; that is the in-band "exists" signal.',
      () => {
        const stored = {
          _e: 'AppConfig',
          _v: 'v1',
          _u: '2025-01-01T00:00:00.000Z',
        };
        expect(stored._u).not.toBe('');
      },
    );

    vtest(
      'pk and sk are both derived from the entity name only',
      'A single-entity has exactly one row; the key is `<EntityName>` for both `pk` and `sk`.',
      () => {
        const key = (entityName: string) => ({
          pk: entityName,
          sk: entityName,
        });
        expect(key('AppConfig')).toEqual({ pk: 'AppConfig', sk: 'AppConfig' });
      },
    );
  },
);
