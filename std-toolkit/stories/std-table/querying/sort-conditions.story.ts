import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../support.js';

const titles = ['alpha', 'alphabet', 'beta', 'gamma'];

const seed = Effect.forEach(titles, (title, index) =>
  note.insert({
    noteId: `n${index + 1}`,
    notebook: 'work',
    title,
    status: 'open',
  }),
);

const titlesOf = (page: { items: readonly { value: { title: string } }[] }) =>
  page.items.map(({ value }) => value.title);

const same = (matched: readonly string[], expected: readonly string[]) =>
  JSON.stringify(matched) === JSON.stringify(expected);

export const sortConditions = Story.make({
  title: 'Sort conditions',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Which sort conditions can a query use, and what does each return?',
      {
        answer:
          'Seven: `=`, `<`, `<=`, `>`, `>=`, `between`, and `beginsWith` — each takes the sort-key components and selects the slice of the partition its operator names.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const pk = { notebook: 'work' } as const;
              return {
                '=': titlesOf(
                  yield* note.query('byTitle', { pk, '=': { title: 'beta' } }),
                ),
                '<': titlesOf(
                  yield* note.query('byTitle', { pk, '<': { title: 'beta' } }),
                ),
                '<=': titlesOf(
                  yield* note.query('byTitle', { pk, '<=': { title: 'beta' } }),
                ),
                '>': titlesOf(
                  yield* note.query('byTitle', { pk, '>': { title: 'beta' } }),
                ),
                '>=': titlesOf(
                  yield* note.query('byTitle', { pk, '>=': { title: 'beta' } }),
                ),
                between: titlesOf(
                  yield* note.query('byTitle', {
                    pk,
                    between: [{ title: 'alpha' }, { title: 'beta' }],
                  }),
                ),
                beginsWith: titlesOf(
                  yield* note.query('byTitle', {
                    pk,
                    beginsWith: { title: 'alpha' },
                  }),
                ),
              };
            }),
          );
          const matched = results.sqlite;
          yield* Story.assert(
            'each condition selects the slice its operator names',
            same(matched['='], ['beta']) &&
              same(matched['<'], ['alphabet', 'alpha']) &&
              same(matched['<='], ['beta', 'alphabet', 'alpha']) &&
              same(matched['>'], ['gamma']) &&
              same(matched['>='], ['beta', 'gamma']) &&
              same(matched.between, ['alpha', 'alphabet', 'beta']) &&
              same(matched.beginsWith, ['alpha', 'alphabet']),
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('Which direction does each condition read in?', {
      answer:
        '`<` and `<=` read descending; `=`, `>`, `>=`, `between`, and `beginsWith` all read ascending.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const pk = { notebook: 'work' } as const;
            return {
              descendingLess: titlesOf(
                yield* note.query('byTitle', { pk, '<': { title: 'zulu' } }),
              ),
              descendingLessOrEqual: titlesOf(
                yield* note.query('byTitle', { pk, '<=': null }),
              ),
              ascendingGreater: titlesOf(
                yield* note.query('byTitle', { pk, '>': { title: 'a' } }),
              ),
              ascendingGreaterOrEqual: titlesOf(
                yield* note.query('byTitle', { pk, '>=': null }),
              ),
              ascendingBetween: titlesOf(
                yield* note.query('byTitle', {
                  pk,
                  between: [{ title: 'a' }, { title: 'z' }],
                }),
              ),
              ascendingPrefix: titlesOf(
                yield* note.query('byTitle', {
                  pk,
                  beginsWith: { title: 'alpha' },
                }),
              ),
            };
          }),
        );
        const ascending = ['alpha', 'alphabet', 'beta', 'gamma'];
        const descending = [...ascending].reverse();
        const read = results.sqlite;
        yield* Story.assert(
          'the two less-than conditions read descending',
          same(read.descendingLess, descending) &&
            same(read.descendingLessOrEqual, descending),
        );
        yield* Story.assert(
          'every other condition reads ascending',
          same(read.ascendingGreater, ascending) &&
            same(read.ascendingGreaterOrEqual, ascending) &&
            same(read.ascendingBetween, ascending) &&
            same(read.ascendingPrefix, ['alpha', 'alphabet']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
