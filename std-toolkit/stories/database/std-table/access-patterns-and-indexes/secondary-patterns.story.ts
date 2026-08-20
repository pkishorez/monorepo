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
    'Asking the same table a different question by naming a different access pattern.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      "How do you query by something that isn't the primary key?",
      {
        answer:
          'Name a secondary access pattern instead of `primary` — `byStatus` sits on a GSI keyed by `[status, title]`, so a prefix on `status` returns just the notes in that status.',
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
    Story.question('What does an LSI pattern give you?', {
      answer:
        'The same partition in a different order — `byTitle` keeps the notebook as its partition key and sorts by title instead of by note id.',
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
