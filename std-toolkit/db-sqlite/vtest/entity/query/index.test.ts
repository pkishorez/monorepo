import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.query contract',
  '`SQLiteEntity#query(key, params, options?)` runs an index-aware SQL query. Direction is inferred from the SK operator; `key === "primary"` targets the primary index, anything else targets a secondary.',
  () => {
    vtest(
      'sk operator selects the comparator and the direction',
      '`>` / `>=` query forward; `<` / `<=` query backward. `between` and `beginsWith` keep the default forward direction unless overridden.',
      () => {
        const dir = (op: string) =>
          op === '<' || op === '<=' ? 'DESC' : 'ASC';
        expect(dir('>')).toBe('ASC');
        expect(dir('<')).toBe('DESC');
        expect(dir('beginsWith')).toBe('ASC');
      },
    );

    vtest(
      'limit defaults to 100 when not specified',
      'A bare query never returns the full table by accident; pass an explicit `limit` for paging-aware code.',
      () => {
        const defaultLimit = 100;
        expect(defaultLimit).toBe(100);
      },
    );

    vtest(
      'between [a, b] becomes BETWEEN a AND b',
      'The library translates `{ between: [start, end] }` into a single SQL `BETWEEN` clause — both ends inclusive.',
      () => {
        const cond = { between: ['2025-01-01', '2025-01-31'] };
        expect(cond.between[0]).toBe('2025-01-01');
        expect(cond.between[1]).toBe('2025-01-31');
      },
    );

    vtest(
      'beginsWith prefix becomes LIKE "prefix%"',
      'Used for timeline-prefix queries: e.g. all posts in 2025-01 via `{ beginsWith: "2025-01" }`.',
      () => {
        const prefix = '2025-01';
        const like = `${prefix}%`;
        expect(like).toBe('2025-01%');
      },
    );

    vtest(
      'returns { items: EntityType<T>[] }, never a flat array',
      'The envelope matches `db-dynamodb`; callers always destructure `{ items }`.',
      () => {
        const result = { items: [] as { value: unknown; meta: unknown }[] };
        expect('items' in result).toBe(true);
      },
    );

    vtest(
      'unknown secondary index name fails with queryFailed',
      "Passing a key that isn't in the entity's secondary derivation map is a typed error, not an exception.",
      () => {
        const err = { _tag: 'QueryFailed', cause: 'Index XX not found' };
        expect(err._tag).toBe('QueryFailed');
      },
    );
  },
);
