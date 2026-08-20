import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, layerParity, note } from '../../support.js';

const key = { noteId: 'selected', notebook: 'layers' };

export const layerSelection = Story.make({
  title: 'Layer selection',
  description:
    'The layer around a program selects the database. The program does not.',
  setupNote:
    'Two Memory tables, supplied as two layers. The program runs inside one, then inside the other.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A program never names a database. How is one selected, and can it change inside the program?',
      {
        answer:
          'The layer around the program selects it. An inner scope can supply a different layer. Operations inside that scope use the inner database. Operations before and after it use the outer database.',
        proof: Effect.gen(function* () {
          const results = yield* layerParity((outer, inner) =>
            Effect.gen(function* () {
              yield* note
                .insert({ ...key, title: 'Outer', status: 'open' })
                .pipe(Effect.provide(outer));
              yield* note
                .insert({ ...key, title: 'Inner', status: 'open' })
                .pipe(Effect.provide(inner));

              return yield* Effect.gen(function* () {
                const before = yield* note.get(key);
                const nested = yield* note.get(key).pipe(Effect.provide(inner));
                const after = yield* note.get(key);
                return [
                  before?.value.title,
                  nested?.value.title,
                  after?.value.title,
                ];
              }).pipe(Effect.provide(outer));
            }),
          );
          yield* Story.assert(
            'the inner layer is local to its scope',
            JSON.stringify(results.memory) ===
              JSON.stringify(['Outer', 'Inner', 'Outer']),
          );
          yield* Story.assert('every Adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
