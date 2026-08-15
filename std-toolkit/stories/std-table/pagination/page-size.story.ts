import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../support.js';

const ids = Array.from(
  { length: 101 },
  (_, index) => `n${String(index + 1).padStart(3, '0')}`,
);

const seed = Effect.forEach(ids, (noteId) =>
  note.insert({ noteId, notebook: 'work', title: noteId, status: 'open' }),
);

export const pageSize = Story.make({
  title: 'Page size',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How many rows does a query return if you never say?', {
      answer:
        'One hundred — that is the default page size, and `hasMore` is true whenever rows are left behind.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const page = yield* note.query('primary', {
              pk: { notebook: 'work' },
              '>=': null,
            });
            return { count: page.items.length, hasMore: page.hasMore };
          }),
        );
        yield* Story.assert(
          'a query over 101 rows returns 100 of them and reports more',
          results.sqlite.count === 100 && results.sqlite.hasMore,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How do you ask for a smaller page?', {
      answer:
        'Pass `limit` — the query returns exactly that many rows, in sort-key order, and still reports whether more remain.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const page = yield* note.query(
              'primary',
              { pk: { notebook: 'work' }, '>=': null },
              { limit: 3 },
            );
            return {
              ids: page.items.map(({ value }) => value.noteId),
              hasMore: page.hasMore,
            };
          }),
        );
        yield* Story.assert(
          'the page holds the first three rows and reports more',
          results.sqlite.ids.length === 3 &&
            results.sqlite.ids[0] === 'n001' &&
            results.sqlite.hasMore,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
