import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const seeded = [
  { noteId: 'n1', notebook: 'work', title: 'Draft', status: 'open' },
  { noteId: 'n2', notebook: 'work', title: 'Review', status: 'open' },
  { noteId: 'n3', notebook: 'home', title: 'Groceries', status: 'open' },
];

const seed = Effect.forEach(seeded, (value) => note.insert(value));

const idsOf = (page: { items: readonly { value: { noteId: string } }[] }) =>
  page.items.map(({ value }) => value.noteId);

export const keyedEntities = Story.make({
  title: 'Keyed entities',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does an entity decide which partition a row lands in?',
      {
        answer:
          'The `.primary({ pk: [...] })` components name the fields whose values form the partition, so rows sharing those values share one partition.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const work = yield* note.query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
              });
              const home = yield* note.query('primary', {
                pk: { notebook: 'home' },
                '>=': null,
              });
              return { work: idsOf(work), home: idsOf(home) };
            }),
          );
          yield* Story.assert(
            'the two work notes share a partition and the home note sits in its own',
            results.sqlite.work.join() === 'n1,n2' &&
              results.sqlite.home.join() === 'n3',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question("What is the sort key of an entity's primary pattern?", {
      answer:
        'The declared id field, always — every row is ordered inside its partition by its own id.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* seed;
            const matching = yield* note.query('primary', {
              pk: { notebook: 'work' },
              beginsWith: { noteId: 'n1' },
            });
            const missing = yield* note.query('primary', {
              pk: { notebook: 'work' },
              beginsWith: { noteId: 'z' },
            });
            return { matching: idsOf(matching), missing: idsOf(missing) };
          }),
        );
        yield* Story.assert(
          'the primary sort key is the declared id field',
          note.primary.sk.join() === 'noteId',
        );
        yield* Story.assert(
          'a sort-key prefix selects rows by id',
          results.sqlite.matching.join() === 'n1' &&
            results.sqlite.missing.length === 0,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
