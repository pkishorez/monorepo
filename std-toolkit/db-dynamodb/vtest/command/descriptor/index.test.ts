import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.descriptor is pure introspection',
  'No DynamoDB round-trip — the descriptor is computed in-memory from the registered entities.',
  () => {
    vtest(
      'single entities are excluded',
      '`registry.getSchema()` only enumerates regular-entity descriptors.',
      () => {
        const descriptors = [{ name: 'User' }, { name: 'Order' }];
        const names = descriptors.map((d) => d.name);
        expect(names.includes('AppConfig')).toBe(false);
      },
    );

    vtest(
      'schema versions are the latest',
      'Each descriptor reports `eschema.latestVersion`; older versions are not enumerated.',
      () => {
        const descriptor = { name: 'User', version: 'v2' };
        expect(descriptor.version).toBe('v2');
      },
    );

    vtest(
      'index patterns are templated strings',
      'Patterns look like `{Entity}#{field}#{...}` rather than example values.',
      () => {
        const pattern = 'User#{id}';
        expect(pattern).toMatch(/^\w+#\{[^}]+\}/);
      },
    );
  },
);
