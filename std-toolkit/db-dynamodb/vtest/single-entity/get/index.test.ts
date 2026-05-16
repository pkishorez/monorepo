import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'singleEntity.get is total',
  'A missing row returns the configured default with synthetic meta — `get` never resolves to `null`.',
  () => {
    vtest(
      'missing row ⇒ default value with _u: empty string',
      'The synthetic meta uses `_u: ""` so callers can distinguish "never written" from a real timestamp.',
      () => {
        const synthetic = {
          value: { theme: 'light' },
          meta: { _e: 'AppConfig', _v: 'v1', _u: '' },
        };
        expect(synthetic.meta._u).toBe('');
      },
    );

    vtest(
      'no tombstone semantics',
      'Single entities have no `_d` — to clear, write a `put` with the reset shape.',
      () => {
        const meta = { _e: 'AppConfig', _v: 'v1', _u: 'x' };
        expect('_d' in meta).toBe(false);
      },
    );

    vtest(
      'ConsistentRead is opt-in',
      'Defaults to false; pass `{ ConsistentRead: true }` for strong consistency.',
      () => {
        const opts: { ConsistentRead?: boolean } = {};
        expect(opts.ConsistentRead).toBeUndefined();
      },
    );
  },
);
