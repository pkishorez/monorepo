import { Effect } from 'effect';
import { Story } from 'laymos/story';

import {
  adapterNames,
  agree,
  dynamodbEndpoint,
  note,
  parity,
} from '../../support.js';

export const threeRealBackends = Story.make({
  title: 'Three real backends',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which databases does every proof actually run against?', {
      answer:
        'All three at once — DynamoDB Local over HTTP, a real IndexedDB implementation, and an in-memory SQLite database — and `parity` returns what each one produced.',
      proof: Effect.gen(function* () {
        const results = yield* parity(Effect.succeed('same everywhere'));
        yield* Story.assert(
          'every adapter ran the same program',
          JSON.stringify(Object.keys(results)) === JSON.stringify(adapterNames),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return { ...results, dynamodbEndpoint };
      }),
    }),
    Story.question('Why do the three results match down to the update stamp?', {
      answer:
        'Each run gets the same deterministic update-stamp sequence instead of real ULIDs, so a whole stored entity — metadata included — can be compared across adapters.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const first = yield* note.insert({
              noteId: 'n1',
              notebook: 'harness',
              title: 'First',
              status: 'open',
            });
            const second = yield* note.insert({
              noteId: 'n2',
              notebook: 'harness',
              title: 'Second',
              status: 'open',
            });
            return [first.meta._u, second.meta._u];
          }),
        );
        yield* Story.assert(
          'stamps advance one step at a time',
          results.sqlite[0] !== results.sqlite[1],
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
