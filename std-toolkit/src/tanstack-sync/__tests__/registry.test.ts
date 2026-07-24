import { describe, expect, it } from 'vitest';

import { createStdSync } from '../create-std-sync.js';

describe('TanStack Sync', () => {
  describe('Registry', () => {
    describe('Behavior', () => {
      it.each([
        null,
        {},
        { values: [] },
        { values: [], persist: 'yes' },
        { values: {}, persist: true },
      ])('rejects an invalid broadcast message: %j', (message) => {
        const registry = createStdSync().registry();

        expect(() => registry.process(message as never)).toThrow(
          '[std-sync] registry.process requires { values: Entity[]; persist: boolean }.',
        );
      });

      it('accepts an empty broadcast', () => {
        const registry = createStdSync().registry();

        expect(() =>
          registry.process({ values: [], persist: false }),
        ).not.toThrow();
      });
    });
  });
});
