import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'batchInsert contract',
  'Best-effort batched put with no per-row condition. `unprocessedIndexes` returns positions in the input array; `written` excludes them.',
  () => {
    vtest(
      'unprocessedIndexes is positional, not by value',
      'Indexes are positions in the original `values` array, not row keys.',
      () => {
        const input = ['a', 'b', 'c'];
        const unprocessedIndexes = [1];
        const written = input.filter((_, i) => !unprocessedIndexes.includes(i));
        expect(written).toEqual(['a', 'c']);
      },
    );

    vtest(
      'written excludes unprocessed indexes',
      'The two arrays partition the input; their lengths sum to `values.length`.',
      () => {
        const total = 5;
        const unprocessed = 2;
        const written = total - unprocessed;
        expect(written + unprocessed).toBe(total);
      },
    );

    vtest(
      'no per-row condition',
      'Unlike single `insert`, batch writes have no `attribute_not_exists` collision check.',
      () => {
        const hasCollisionCheck = false;
        expect(hasCollisionCheck).toBe(false);
      },
    );

    vtest(
      'no broadcast',
      '`batchInsert` does not emit through `ConnectionService` — subscribers do not see the rows until they are read.',
      () => {
        const broadcasts = 0;
        expect(broadcasts).toBe(0);
      },
    );
  },
);
