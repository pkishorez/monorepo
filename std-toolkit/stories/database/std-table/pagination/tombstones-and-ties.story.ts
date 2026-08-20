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
    'Deleted rows sit between live ones without eating into the page you asked for.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Do deleted rows use up the page limit?', {
      answer:
        'No — the limit counts the rows you actually receive, so a page comes back full of live rows even when tombstones sit between them.',
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
    }),
    Story.question('How do rows that share an identical sort key paginate?', {
      answer:
        'Ties break by primary key, so a one-row-at-a-time walk still sees each tied row exactly once.',
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
    }),
  ],
});
