import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, layerParity, note } from '../../support.js';

const key = { noteId: 'selected', notebook: 'layers' };

export const layerSelection = Story.make({
  title: 'Layer selection',
  description:
    'Which database a program talks to is chosen by the layer around it, not by the program.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a nested scope provides another Adapter layer for the same StdTable?',
      {
        answer:
          'The nested layer selects its Adapter only inside that scope. Before and after the nested scope, operations use the outer layer again.',
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
