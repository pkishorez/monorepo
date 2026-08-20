import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const notes = [
  { noteId: 'n1', notebook: 'work', title: 'Draft', status: 'open' },
  { noteId: 'n2', notebook: 'work', title: 'Review', status: 'open' },
  { noteId: 'n3', notebook: 'work', title: 'Ship', status: 'done' },
];

const seed = Effect.forEach(notes, (value) => note.insert(value));

export const listingAPartition = Story.make({
  title: 'Listing a partition',
  description: 'Read a whole notebook with a condition that has no bound.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A notebook holds notes under one partition key. How are all of them read?',
      {
        answer:
          'Query the primary pattern with a condition that has no bound. The query then reads the whole partition in sort-key order.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const page = yield* note.query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
              });
              return {
                ids: page.items.map(({ value }) => value.noteId),
                hasMore: page.hasMore,
              };
            }),
          );
          yield* Story.assert(
            'the whole partition comes back in ascending sort-key order',
            JSON.stringify(results.sqlite.ids) ===
              JSON.stringify(['n1', 'n2', 'n3']),
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('How are they read with the newest first?', {
      answer:
        'Ask the query to read backwards. The same rows come back in the opposite order.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const page = yield* note.query('primary', {
              pk: { notebook: 'work' },
              '<=': null,
            });
            return page.items.map(({ value }) => value.noteId);
          }),
        );
        yield* Story.assert(
          'the partition reads back descending',
          JSON.stringify(results.sqlite) === JSON.stringify(['n3', 'n2', 'n1']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What does an empty notebook return?', {
      answer: 'An empty list. An empty partition is a value, not a failure.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const page = yield* note.query('primary', {
              pk: { notebook: 'personal' },
              '>=': null,
            });
            return {
              ids: page.items.map(({ value }) => value.noteId),
              hasMore: page.hasMore,
            };
          }),
        );
        yield* Story.assert(
          'the empty partition yields an empty page rather than an error',
          results.sqlite.ids.length === 0 && results.sqlite.hasMore === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
