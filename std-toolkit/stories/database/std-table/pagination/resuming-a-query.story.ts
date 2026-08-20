import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const ids = Array.from({ length: 7 }, (_, index) => `n${index + 1}`);

const seed = Effect.forEach(ids, (noteId) =>
  note.insert({ noteId, notebook: 'work', title: noteId, status: 'open' }),
);

const firstPage = note.query(
  'primary',
  { pk: { notebook: 'work' }, '>=': null },
  { limit: 3 },
);

export const resumingAQuery = Story.make({
  title: 'Resuming a query',
  description:
    'Continue where the last page stopped. There is no cursor to keep.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A page ends before the partition does. How is the next page read?',
      {
        answer:
          'Give the query the last entity of the page that you just read. There is no cursor to keep, and this method reads each row one time.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const seen: string[] = [];
              let pages = 0;
              let page = yield* firstPage;
              seen.push(...page.items.map(({ value }) => value.noteId));
              pages += 1;
              while (page.hasMore) {
                page = yield* note.query(
                  'primary',
                  { pk: { notebook: 'work' }, '>=': null },
                  { limit: 3, after: page.items.at(-1)! },
                );
                seen.push(...page.items.map(({ value }) => value.noteId));
                pages += 1;
              }
              return { pages, seen, unique: new Set(seen).size };
            }),
          );
          yield* Story.assert(
            'the walk sees all seven rows once each',
            results.sqlite.seen.length === 7 && results.sqlite.unique === 7,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('What happens at the end of the notebook?', {
      answer:
        'The result is empty and says that no rows remain. Reading past the end is not a failure.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const all = yield* note.query('primary', {
              pk: { notebook: 'work' },
              '>=': null,
            });
            const past = yield* note.query(
              'primary',
              { pk: { notebook: 'work' }, '>=': null },
              { after: all.items.at(-1)! },
            );
            return { count: past.items.length, hasMore: past.hasMore };
          }),
        );
        yield* Story.assert(
          'the page past the end is empty and final',
          results.sqlite.count === 0 && results.sqlite.hasMore === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
