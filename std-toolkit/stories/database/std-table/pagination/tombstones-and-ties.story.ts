import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const ids = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

const seed = Effect.forEach(ids, (noteId) =>
  note.insert({ noteId, notebook: 'work', title: noteId, status: 'open' }),
);

const tie = (noteId: string) =>
  note.insert({ noteId, notebook: 'ties', title: 'same', status: 'open' });

export const tombstonesAndTies = Story.make({
  title: 'Tombstones and ties',
  description:
    'Deleted notes sit between live ones. They do not use the page that you asked for.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook holds many deleted notes. Does a page of ten arrive half full?',
      {
        answer:
          'No. The limit counts the rows that you receive. A page therefore comes back full of live notes, even when deleted notes sit between them.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              yield* note.delete({ noteId: 'n2', notebook: 'work' });
              yield* note.delete({ noteId: 'n4', notebook: 'work' });
              const page = yield* note.query(
                'primary',
                { pk: { notebook: 'work' }, '>=': null },
                { limit: 3, excludeDeleted: true },
              );
              return {
                ids: page.items.map(({ value }) => value.noteId),
                hasMore: page.hasMore,
              };
            }),
          );
          yield* Story.assert(
            'the page skips both tombstones and still returns three live rows',
            results.sqlite.ids.length === 3 &&
              results.sqlite.ids.join() === 'n1,n3,n5',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question(
      'Can paging miss or repeat a note when two notes sort the same?',
      {
        answer:
          'No. Each note has its own position in the sort key, so no two notes sort the same. The walk therefore reads each note one time.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* tie('t1');
              yield* tie('t2');
              yield* tie('t3');
              const seen: string[] = [];
              let page = yield* note.query(
                'byTitle',
                { pk: { notebook: 'ties' }, '=': { title: 'same' } },
                { limit: 1 },
              );
              seen.push(...page.items.map(({ value }) => value.noteId));
              while (page.hasMore) {
                page = yield* note.query(
                  'byTitle',
                  { pk: { notebook: 'ties' }, '=': { title: 'same' } },
                  { limit: 1, after: page.items.at(-1)! },
                );
                seen.push(...page.items.map(({ value }) => value.noteId));
              }
              return seen.sort();
            }),
          );
          yield* Story.assert(
            'the walk collects all three tied rows once each',
            results.sqlite.join() === 't1,t2,t3',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
