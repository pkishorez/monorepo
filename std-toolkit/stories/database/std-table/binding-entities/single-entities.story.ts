import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, parity, settings } from '../../support.js';

export const singleEntities = Story.make({
  title: 'Single entities',
  description:
    'An entity with one row. It returns a declared default instead of null.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook has settings. What do they read as before anyone changes them?',
      {
        answer:
          'They read as the declared default. The value carries the entity name and an empty update stamp. A read of a single entity never fails and never returns null.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const current = yield* settings.get();
              return { value: current.value, meta: current.meta };
            }),
          );
          yield* Story.assert(
            'the default comes back with an empty update stamp',
            results.sqlite.value.theme === 'light' &&
              results.sqlite.value.perPage === 20 &&
              results.sqlite.meta._u === '',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('What does a reset do?', {
      answer:
        'It writes the default value as a real row and gives it a new update stamp. A reset is therefore a write, the same as any other write.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const before = yield* settings.getAndUpdate({ theme: 'dark' });
            const after = yield* settings.reset();
            const stored = yield* settings.get();
            return {
              before: { theme: before.value.theme, _u: before.meta._u },
              after: { theme: after.value.theme, _u: after.meta._u },
              stored: { theme: stored.value.theme, _u: stored.meta._u },
            };
          }),
        );
        yield* Story.assert(
          'reset restores the default and moves the update stamp forward',
          results.sqlite.before.theme === 'dark' &&
            results.sqlite.after.theme === 'light' &&
            results.sqlite.after._u > results.sqlite.before._u &&
            results.sqlite.stored._u === results.sqlite.after._u,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
