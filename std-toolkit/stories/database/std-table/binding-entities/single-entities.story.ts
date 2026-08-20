import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, parity, settings } from '../../support.js';

export const singleEntities = Story.make({
  title: 'Single entities',
  description:
    'An entity with exactly one row, which reads back a declared default instead of null.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook has settings. What do they read as before anyone has ever changed them?',
      {
        answer:
          'Its declared default, stamped as the entity with an empty update stamp — reading one never fails and never returns null.',
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
    Story.question(
      'And restoring the defaults later — is that different from never having touched them?',
      {
        answer:
          'It writes the default value back as a real record and stamps it with a new update version, so a reset is a write like any other.',
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
      },
    ),
  ],
});
