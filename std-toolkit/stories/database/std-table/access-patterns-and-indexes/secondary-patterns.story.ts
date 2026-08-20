import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const notes = [
  { noteId: 'n1', notebook: 'work', title: 'Zebra', status: 'done' },
  { noteId: 'n2', notebook: 'work', title: 'Apple', status: 'open' },
  { noteId: 'n3', notebook: 'work', title: 'Mango', status: 'open' },
];

const seed = Effect.forEach(notes, (value) => note.insert(value));

const idsOf = (page: { items: readonly { value: { noteId: string } }[] }) =>
  page.items.map(({ value }) => value.noteId);

const same = (matched: readonly string[], expected: readonly string[]) =>
  JSON.stringify(matched) === JSON.stringify(expected);

export const secondaryPatterns = Story.make({
  title: 'Secondary patterns',
  description:
    'Ask the same table a different question. Name a different access pattern.',
  setupNote:
    'The `note` from `support.ts`. It has two secondary patterns: `byTitle` and `byStatus`.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The screen wants the open notes only. The primary key cannot do that. What can?',
      {
        answer:
          'A secondary pattern. `byStatus` uses a key of `[status, title]`, so the notes of one status stay together and sort by title inside that group.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const pk = { notebook: 'work' } as const;
              const open = yield* note.query('byStatus', {
                pk,
                beginsWith: { status: 'open', title: 'A' },
              });
              const everyStatus = yield* note.query('byStatus', {
                pk,
                '>=': null,
              });
              return {
                open: idsOf(open),
                everyStatus: idsOf(everyStatus),
              };
            }),
          );
          yield* Story.assert(
            'the secondary pattern filters by status and orders by status then title',
            same(results.sqlite.open, ['n2']) &&
              same(results.sqlite.everyStatus, ['n1', 'n2', 'n3']),
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('How is the same notebook read in a different order?', {
      answer:
        'Name the other secondary pattern. `byTitle` reuses the same partition and orders the notes by title.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const pk = { notebook: 'work' } as const;
            const primary = yield* note.query('primary', { pk, '>=': null });
            const byTitle = yield* note.query('byTitle', { pk, '>=': null });
            return { primary: idsOf(primary), byTitle: idsOf(byTitle) };
          }),
        );
        const { byTitle, primary } = results.sqlite;
        yield* Story.assert(
          'both patterns return the same rows in different orders',
          same(primary, ['n1', 'n2', 'n3']) &&
            same(byTitle, ['n2', 'n3', 'n1']) &&
            same([...byTitle].sort(), [...primary].sort()),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
