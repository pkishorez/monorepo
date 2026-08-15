import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../support.js';

const notes = [
  { noteId: 'n1', notebook: 'work', title: 'draft-one', status: 'open' },
  { noteId: 'n2', notebook: 'work', title: 'draft-two', status: 'open' },
  { noteId: 'n3', notebook: 'work', title: 'notes', status: 'open' },
  { noteId: 'n4', notebook: 'work', title: 'draft-three', status: 'done' },
];

const seed = Effect.forEach(notes, (value) => note.insert(value));

const titlesOf = (page: { items: readonly { value: { title: string } }[] }) =>
  page.items.map(({ value }) => value.title);

const same = (matched: readonly string[], expected: readonly string[]) =>
  JSON.stringify(matched) === JSON.stringify(expected);

export const prefixMatching = Story.make({
  title: 'Prefix matching',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you match a prefix of a sort key?', {
      answer:
        'Use the `beginsWith` condition — it takes the same sort-key components as the other conditions and matches every row whose key starts with the value you give.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const page = yield* note.query('byTitle', {
              pk: { notebook: 'work' },
              beginsWith: { title: 'draft-' },
            });
            return titlesOf(page);
          }),
        );
        yield* Story.assert(
          'only the titles starting with the prefix come back, in ascending order',
          same(results.sqlite, ['draft-one', 'draft-three', 'draft-two']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How does a prefix work on a compound sort key?', {
      answer:
        'The leading components must be given in full and are matched exactly, while the last component you supply is the prefix — so `byStatus` (`[status, title]`) narrows to one status and then to titles inside it.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const pk = { notebook: 'work' } as const;
            const partial = yield* note.query('byStatus', {
              pk,
              beginsWith: { status: 'open', title: 'draft-' },
            });
            const full = yield* note.query('byStatus', {
              pk,
              beginsWith: { status: 'open', title: 'draft-one' },
            });
            return { partial: titlesOf(partial), full: titlesOf(full) };
          }),
        );
        yield* Story.assert(
          'a partial last component matches inside the leading status only',
          same(results.sqlite.partial, ['draft-one', 'draft-two']),
        );
        yield* Story.assert(
          'a full last component narrows to that single row',
          same(results.sqlite.full, ['draft-one']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
