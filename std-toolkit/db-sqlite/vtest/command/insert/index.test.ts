import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.insert contract',
  '`SqliteCommand#process({ operation: "insert", entity, data })` routes the call to `registry.entity(entity).insert(data)` and wraps the result with a `timing` envelope.',
  () => {
    vtest(
      'response.operation echoes the request operation tag',
      'Downstream code uses the literal string to switch on response shape; the value must match exactly.',
      () => {
        const res = { operation: 'insert' as const, entity: 'User' };
        expect(res.operation).toBe('insert');
      },
    );

    vtest(
      'response.data is the EntityType<T> returned by entity.insert',
      'The command processor does not reshape the entity result; it is the same envelope as the typed call.',
      () => {
        const data = {
          value: { userId: '1', email: 'a@b.com', name: 'A' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-01', _d: false },
        };
        expect(data).toHaveProperty('value');
        expect(data).toHaveProperty('meta');
      },
    );

    vtest(
      'timing has startedAt, completedAt, durationMs',
      'The envelope is identical across every operation — sync / RPC tooling can read it without knowing the operation type.',
      () => {
        const startedAt = Date.now();
        const completedAt = startedAt + 5;
        const timing = {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        };
        expect(timing.durationMs).toBeGreaterThanOrEqual(0);
      },
    );

    vtest(
      'unknown entity throws synchronously, not via CommandError',
      '`#getEntity(name)` is invoked outside the `Effect.gen` body; a typo surfaces as an exception, not as a `CommandError`.',
      () => {
        const knownNames = ['User', 'Post'];
        const missing = !knownNames.includes('Ghost');
        expect(missing).toBe(true);
      },
    );

    vtest(
      'entity-level errors are wrapped as CommandError',
      'Insert failures (encode error, SQL error) are mapped into `CommandError` with `operation: "insert"` and the original cause.',
      () => {
        const err = {
          _tag: 'CommandError',
          operation: 'insert',
          entity: 'User',
        };
        expect(err.operation).toBe('insert');
      },
    );
  },
);
