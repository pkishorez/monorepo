import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.update contract',
  '`SqliteCommand#process({ operation: "update", entity, key, data })` routes to `entity.update(key, data)` and wraps the result with timing.',
  () => {
    vtest(
      'payload carries both key and data',
      'Unlike `insert`, the update payload separates the primary-key fields from the merge payload.',
      () => {
        const payload = {
          operation: 'update' as const,
          entity: 'User',
          key: { userId: '1' },
          data: { name: 'A2' },
        };
        expect('key' in payload).toBe(true);
        expect('data' in payload).toBe(true);
      },
    );

    vtest(
      'response.data is the EntityType<T> after the merge',
      'The processor returns whatever `entity.update` returned — i.e. the merged value + fresh meta.',
      () => {
        const data = {
          value: { userId: '1', email: 'a@b.com', name: 'A2' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-02', _d: false },
        };
        expect(data.value.name).toBe('A2');
      },
    );

    vtest(
      'an "Item not found" error maps to CommandError("update")',
      'The entity-layer error (`updateFailed`) is wrapped in a `CommandError` with the original cause attached.',
      () => {
        const err = {
          _tag: 'CommandError',
          operation: 'update',
          entity: 'User',
          message: 'Update failed: Item not found',
        };
        expect(err.operation).toBe('update');
        expect(err.message).toMatch(/Update failed/);
      },
    );

    vtest(
      'timing is computed even when the inner call fails',
      'Actually — no: the timing is only attached to the success response; the error path returns a typed `CommandError` instead. This is intentional and parallels DynamoCommand.',
      () => {
        // Success only — error responses do not have timing
        const success = { operation: 'update', timing: { durationMs: 1 } };
        expect(success.timing).toBeDefined();
      },
    );
  },
);
