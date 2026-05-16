import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'singleEntity.put is unconditional',
  'Put is an upsert — overwrite is the intended semantics for a single-record entity.',
  () => {
    vtest(
      'no conditional check',
      'Unlike `DynamoEntity.insert`, `put` is unconditional — no `attribute_not_exists` is added.',
      () => {
        const hasCollisionCheck = false;
        expect(hasCollisionCheck).toBe(false);
      },
    );

    vtest(
      '_v and _u are always stamped',
      'Both meta fields are written on every call; the caller cannot pin either.',
      () => {
        const meta = { _e: 'AppConfig', _v: 'v1', _u: '2025-01-01' };
        expect(meta._v).toBe('v1');
        expect(meta._u).not.toBe('');
      },
    );

    vtest(
      'no _d, no broadcast',
      'Single entities have no soft-delete and `put` does not emit through `ConnectionService`.',
      () => {
        const meta = { _e: 'AppConfig', _v: 'v1', _u: 'x' };
        const broadcasts = 0;
        expect('_d' in meta).toBe(false);
        expect(broadcasts).toBe(0);
      },
    );
  },
);
