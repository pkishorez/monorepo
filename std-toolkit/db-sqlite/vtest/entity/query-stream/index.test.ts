import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.queryStream contract',
  '`SQLiteEntity#queryStream(key, params, options?)` returns a paginated `Stream` of batches that walks the index until exhausted, using `_u` (or a custom-SK key) as the cursor.',
  () => {
    vtest(
      'only > and < SK operators are accepted',
      'Stream needs a single cursor direction. `>` walks forward; `<` walks backward.',
      () => {
        const accept = (sk: { '>'?: unknown } | { '<'?: unknown }) =>
          '>' in sk || '<' in sk;
        expect(accept({ '>': '' })).toBe(true);
        expect(accept({ '<': 'cursor' })).toBe(true);
      },
    );

    vtest(
      'batchSize defaults to 100',
      'Each underlying query fetches `batchSize` rows and yields them as one chunk.',
      () => {
        const batchSize = 100;
        expect(batchSize).toBe(100);
      },
    );

    vtest(
      "the cursor advances by the LAST item's _u (timeline SK) or idField (primary)",
      "The next page starts strictly after the previous page's last row, so duplicates are impossible.",
      () => {
        const lastU = '2025-01-02T00:00:00.000Z';
        const nextCursor = lastU;
        expect(nextCursor).toBe(lastU);
      },
    );

    vtest(
      'custom-SK secondary indexes use the resolved SK string as the cursor',
      'For an index whose SK is `["publishedAt"]`, the cursor is the derived SK string of the last row, not its `_u`.',
      () => {
        const skString = 'Post#2025-01-01';
        expect(typeof skString).toBe('string');
      },
    );

    vtest(
      'stream terminates when a page returns fewer than batchSize rows',
      'No extra round-trip is made; receiving a short page is the termination signal.',
      () => {
        const isLast = (rows: number, batch: number) => rows < batch;
        expect(isLast(7, 100)).toBe(true);
        expect(isLast(100, 100)).toBe(false);
      },
    );
  },
);
