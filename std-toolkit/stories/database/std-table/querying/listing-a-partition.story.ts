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
  description:
    'Reading a whole notebook: the unbounded condition that walks an entire partition in order.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The screen opens on a notebook. How are all of its notes read?',
      {
        answer:
          'Query the primary pattern with the unbounded condition `">=": null`, which walks the whole item collection in sort-key order.',
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
    Story.question('And newest first?', {
      answer:
        'Swap the condition to `"<=": null` — `<` and `<=` are the descending conditions, so the same partition reads back last to first.',
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
      answer:
        'An empty page — no items and `hasMore: false` — because an unknown partition is a value, not a failure.',
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
