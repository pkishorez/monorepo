import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const ids = Array.from(
  { length: 101 },
  (_, index) => `n${String(index + 1).padStart(3, '0')}`,
);

const seed = Effect.forEach(ids, (noteId) =>
  note.insert({ noteId, notebook: 'work', title: noteId, status: 'open' }),
);

export const pageSize = Story.make({
  title: 'Page size',
  description:
    'A query has a page size whether you ask for one or not. It also says whether rows remain.',
  spine: true,
  setupNote:
    'The `note` from `support.ts`, with more notes than one page holds.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A notebook holds thousands of notes and the query asked for all of them. How many arrive?',
      {
        answer:
          'One hundred. That is the default page size. The result also says that rows remain.',
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
      },
    ),
    Story.question('How does the query return a smaller page?', {
      answer:
        'Give the query a limit. The result then holds that many rows, and it still says whether rows remain.',
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
