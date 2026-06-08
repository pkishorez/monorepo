import { serializePartition } from '@std-toolkit/cache';
import { vdescribe, vtest } from '@monorepo/vtest';
import { expect } from 'vitest';

vdescribe(
  'serializePartition makes a stable partition string',
  'a partition label becomes one canonical, order-independent key',
  () => {
    vtest(
      'dimensions serialize to a sorted, joined string',
      'each key:value pair joins with # in sorted-key order',
      () => {
        expect(serializePartition({ tenant: 'acme', region: 'eu' })).toBe(
          'region:eu#tenant:acme',
        );
      },
    );

    vtest(
      'key order in the input does not change the output',
      'the same logical partition always lands on the same string',
      () => {
        const a = serializePartition({ tenant: 'acme', region: 'eu' });
        const b = serializePartition({ region: 'eu', tenant: 'acme' });
        expect(a).toBe(b);
      },
    );

    vtest(
      'no partition serializes to the empty default',
      'absent or empty means the unpartitioned slice',
      () => {
        expect(serializePartition()).toBe('');
        expect(serializePartition({})).toBe('');
      },
    );
  },
);
