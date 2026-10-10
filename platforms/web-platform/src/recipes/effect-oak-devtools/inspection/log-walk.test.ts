import { expect, it } from 'vitest';
import type { Entry } from 'effect-oak';
import { allEntries } from './log-walk.ts';

it('walks a Branch many thousands of entries deep', () => {
  const byParent = new Map<number | null, ReadonlyArray<Entry>>(
    Array.from({ length: 50_000 }, (_, id) => {
      const parent = id === 0 ? null : id - 1;
      return [parent, [{ id, parent } as Entry]];
    }),
  );
  expect(allEntries((of) => byParent.get(of) ?? [])).toHaveLength(50_000);
});
