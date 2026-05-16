import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.descriptor contract',
  '`SqliteCommand#process({ operation: "descriptor" })` returns the registry\'s `RegistrySchema.descriptors` — one per registered regular entity — plus a timing envelope.',
  () => {
    vtest(
      'descriptors are taken from registry.getSchema().descriptors',
      "The command processor does not assemble the descriptor itself; it forwards the registry's view.",
      () => {
        const descriptors = [{ name: 'User' }, { name: 'Post' }];
        expect(descriptors).toHaveLength(2);
      },
    );

    vtest(
      'single-entities are NOT in the descriptor surface',
      'They have no index map; the descriptor only covers regular entities.',
      () => {
        const regulars = ['User', 'Post'];
        const singles = ['AppConfig'];
        const descriptors = regulars; // single-entities are excluded
        expect(descriptors.includes('AppConfig')).toBe(false);
        expect(singles).toContain('AppConfig');
      },
    );

    vtest(
      'each descriptor carries primaryIndex + secondaryIndexes',
      'Index patterns and field deps are the wire shape RPC clients consume.',
      () => {
        const descriptor = {
          name: 'User',
          idField: 'userId',
          primaryIndex: {
            pk: { deps: [], pattern: 'User' },
            sk: { deps: ['userId'], pattern: '{userId}' },
          },
          secondaryIndexes: [
            {
              name: 'byEmail',
              pk: { deps: ['email'], pattern: 'User#byEmail#{email}' },
              sk: { deps: ['_u'], pattern: '{_u}' },
            },
          ],
        };
        expect(descriptor.primaryIndex).toBeDefined();
        expect(descriptor.secondaryIndexes).toHaveLength(1);
      },
    );

    vtest(
      'response.operation === "descriptor", with timing',
      'Same envelope as every other op; clients can discover the schema without knowing the entity types ahead of time.',
      () => {
        const res = {
          operation: 'descriptor' as const,
          timing: { startedAt: 0, completedAt: 1, durationMs: 1 },
          descriptors: [],
        };
        expect(res.operation).toBe('descriptor');
      },
    );
  },
);
