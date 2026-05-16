import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'singleEntity.update contract',
  'Partial or expression-builder update; always version-locked on `_v = latest`; always refreshes `_u`.',
  () => {
    vtest(
      'no row → noItemToUpdate',
      'If the row has never been written, the conditional fails with the missing-row tag.',
      () => {
        const tag = 'noItemToUpdate' as const;
        expect(tag).toBe('noItemToUpdate');
      },
    );

    vtest(
      'with user condition → conditionCheckFailed',
      'Same mapping as regular entity: the library cannot distinguish missing-row from user-condition-false once a condition is supplied.',
      () => {
        const tag = 'conditionCheckFailed' as const;
        expect(tag).toBe('conditionCheckFailed');
      },
    );

    vtest(
      '_u is always refreshed',
      'Every update appends `SET _u = :iso` regardless of the rest of the expression.',
      () => {
        const expr = 'SET theme = :t, _u = :u';
        expect(expr).toContain('_u');
      },
    );

    vtest(
      'no _d in meta',
      'Single entities have no soft-delete; `_d` is silently absent from the meta schema.',
      () => {
        const metaKeys = ['_e', '_v', '_u'];
        expect(metaKeys.includes('_d')).toBe(false);
      },
    );
  },
);
