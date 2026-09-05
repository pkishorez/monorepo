import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

export const queriesThatAreRefused = Story.make({
  title: 'Queries that are refused',
  description:
    'A query names one pattern, gives exactly one sort condition, and asks for at least one row. Anything else fails before it reads.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What if a query gives two sort conditions, or none?', {
      answer:
        "It fails with `InvalidQuery` and reads nothing. A query has exactly one sort condition; `'>=': null` is how you ask for the whole group when you have no bound in mind.",
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Ask for the work board with two conditions at once.
            const two = yield* task
              .query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
                '<=': null,
              } as never)
              .pipe(Effect.flip);
            // Ask for it with no condition at all.
            const none = yield* task
              .query('primary', { pk: { boardId: 'work' } } as never)
              .pipe(Effect.flip);
            yield* Story.assert(
              'both are refused as invalid queries',
              two.reason._tag === 'InvalidQuery' &&
                none.reason._tag === 'InvalidQuery',
            );
            return { two: two.reason, none: none.reason };
          }),
        ),
      ),
    }),
    Story.question(
      'What about a pattern that does not exist, or a limit of zero?',
      {
        answer:
          'Both fail with `InvalidQuery` too. The pattern name must be one the entity declared, and the page size must be a whole number of at least one; the checks run before the database is asked anything.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Ask through a pattern Task never declared.
              const unknown = yield* task
                .query(
                  'byAuthor' as never,
                  {
                    pk: { boardId: 'work' },
                    '>=': null,
                  } as never,
                )
                .pipe(Effect.flip);
              // Ask for a page of nothing.
              const zero = yield* task
                .query(
                  'primary',
                  { pk: { boardId: 'work' }, '>=': null },
                  { limit: 0 },
                )
                .pipe(Effect.flip);
              yield* Story.assert(
                'an undeclared pattern and a zero limit are both invalid queries',
                unknown.reason._tag === 'InvalidQuery' &&
                  zero.reason._tag === 'InvalidQuery',
              );
              return { unknown: unknown.reason, zero: zero.reason };
            }),
          ),
        ),
      },
    ),
  ],
});
