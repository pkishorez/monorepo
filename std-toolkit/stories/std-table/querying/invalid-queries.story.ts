import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../support.js';

export const invalidQueries = Story.make({
  title: 'Invalid queries',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens if a query gives two sort conditions?', {
      answer:
        'It fails with `InvalidQuery` — a query carries exactly one sort condition, never zero and never two.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const two = yield* note
              .query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
                '<=': null,
              } as never)
              .pipe(Effect.flip);
            const none = yield* note
              .query('primary', { pk: { notebook: 'work' } } as never)
              .pipe(Effect.flip);
            return { two: reasonOf(two), none: reasonOf(none) };
          }),
        );
        yield* Story.assert(
          'both two conditions and no condition are rejected as invalid queries',
          results.sqlite.two === 'InvalidQuery' &&
            results.sqlite.none === 'InvalidQuery',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question(
      'What happens with an unknown access pattern, or a limit of zero?',
      {
        answer:
          'Both fail with `InvalidQuery` before any database work happens — the pattern name must be one the entity declared, and the limit must be a positive integer.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const unknown = yield* note
                .query(
                  'byAuthor' as never,
                  {
                    pk: { notebook: 'work' },
                    '>=': null,
                  } as never,
                )
                .pipe(Effect.flip);
              const zeroLimit = yield* note
                .query(
                  'primary',
                  { pk: { notebook: 'work' }, '>=': null },
                  { limit: 0 },
                )
                .pipe(Effect.flip);
              return {
                unknown: reasonOf(unknown),
                zeroLimit: reasonOf(zeroLimit),
              };
            }),
          );
          yield* Story.assert(
            'an undeclared pattern and a zero limit are both invalid queries',
            results.sqlite.unknown === 'InvalidQuery' &&
              results.sqlite.zeroLimit === 'InvalidQuery',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
