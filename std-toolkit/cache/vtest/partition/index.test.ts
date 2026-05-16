import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';
import { serializePartition } from '@std-toolkit/cache';

vdescribe(
  'serializePartition handles the empty cases',
  'Both an absent argument and an empty record map to the empty string so callers can concatenate the result with a fixed prefix.',
  () => {
    vtest(
      'undefined → empty string',
      'No argument means no partition; the function returns `""`.',
      () => {
        expect(serializePartition()).toBe('');
      },
    );

    vtest(
      'empty record → empty string',
      'An empty `{}` is treated the same as a missing partition.',
      () => {
        expect(serializePartition({})).toBe('');
      },
    );
  },
);

vdescribe(
  'serializePartition shapes the output',
  'Keys are joined as `<k>:<v>` and concatenated with `#`. With a single pair the separator never appears.',
  () => {
    vtest(
      'single pair → "<k>:<v>"',
      'No `#` is emitted when there is only one entry.',
      () => {
        expect(serializePartition({ tenant: 'acme' })).toBe('tenant:acme');
      },
    );

    vtest(
      'multi-key output is sorted ASCII-ascending by key',
      'Output is `a:..#m:..#z:..` regardless of declaration order.',
      () => {
        expect(serializePartition({ z: '1', a: '2', m: '3' })).toBe(
          'a:2#m:3#z:1',
        );
      },
    );
  },
);

vdescribe(
  'serializePartition is order-stable',
  'Two inputs with the same entries declared in different orders must produce the same string — otherwise the result cannot be used as a stable key.',
  () => {
    vtest(
      'same entries in different orders → same output',
      'Sorting keys before joining is what makes the function suitable for keying.',
      () => {
        const a = serializePartition({ tenant: 'acme', region: 'eu' });
        const b = serializePartition({ region: 'eu', tenant: 'acme' });
        expect(a).toBe(b);
        expect(a).toBe('region:eu#tenant:acme');
      },
    );
  },
);
