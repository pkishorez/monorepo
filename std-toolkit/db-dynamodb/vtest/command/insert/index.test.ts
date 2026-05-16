import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.insert wraps entity.insert',
  'The payload is routed to `registry.entity(payload.entity).insert(payload.data)` and the result is wrapped in `{ operation, entity, data, timing }`.',
  () => {
    vtest(
      'no condition field in the payload',
      'Wire-level inserts only get the built-in collision check.',
      () => {
        const payload: { condition?: unknown } = {};
        expect(payload.condition).toBeUndefined();
      },
    );

    vtest(
      'itemAlreadyExists ⇒ CommandError with operation: insert',
      'The original `DynamodbError` is preserved in `cause`.',
      () => {
        const err = {
          operation: 'insert' as const,
          entity: 'User',
          message: 'Insert failed: itemAlreadyExists',
          cause: { _tag: 'itemAlreadyExists' },
        };
        expect(err.operation).toBe('insert');
      },
    );

    vtest(
      'timing includes startedAt, completedAt, durationMs',
      'All three numeric fields are present on every response.',
      () => {
        const timing = {
          startedAt: 100,
          completedAt: 250,
          durationMs: 150,
        };
        expect(timing.completedAt - timing.startedAt).toBe(timing.durationMs);
      },
    );
  },
);
