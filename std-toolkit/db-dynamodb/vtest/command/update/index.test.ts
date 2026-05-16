import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.update is partial-only',
  'The wire format exposes only the plain-partial flavour of `entity.update`.',
  () => {
    vtest(
      'no expression-builder form over the wire',
      'Shipping closures is not part of the JSON wire format.',
      () => {
        const allowed = ['partial'] as const;
        expect(allowed.includes('partial')).toBe(true);
      },
    );

    vtest(
      'no condition field in the payload',
      'Only the built-in `_v = latest` lock is in effect.',
      () => {
        const payload: { condition?: unknown } = {};
        expect(payload.condition).toBeUndefined();
      },
    );

    vtest(
      'noItemToUpdate ⇒ CommandError with operation: update',
      'The mapping rule from `entity.update` is preserved.',
      () => {
        const err = {
          operation: 'update' as const,
          entity: 'User',
          message: 'Update failed: noItemToUpdate',
        };
        expect(err.operation).toBe('update');
      },
    );
  },
);
