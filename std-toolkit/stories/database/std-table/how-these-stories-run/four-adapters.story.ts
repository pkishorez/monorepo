import { Effect } from 'effect';
import { Story } from 'laymos/story';

import {
  adapterNames,
  agree,
  dynamodbEndpoint,
  note,
  parity,
} from '../../support.js';

export const fourAdapters = Story.make({
  title: 'Four adapters',
  description:
    'Every proof in this part runs on four databases at once, and all four have to agree.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which databases does every proof run against?', {
      answer:
        'All four at once — DynamoDB Local over HTTP, IndexedDB, Memory, and an in-memory SQLite database — and `parity` returns what each Adapter produced.',
      proof: Effect.gen(function* () {
        const results = yield* parity(Effect.succeed('same everywhere'));
        yield* Story.assert(
          'every Adapter ran the same program',
          JSON.stringify(Object.keys(results)) === JSON.stringify(adapterNames),
        );
        yield* Story.assert('every Adapter agrees', agree(results));
        return { ...results, dynamodbEndpoint };
      }),
    }),
    Story.question('Why do the four results match down to the update stamp?', {
      answer:
        'Each run gets the same deterministic update-stamp sequence instead of real ULIDs, so a whole stored Entity — Entity Meta included — can be compared across Adapters.',
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
        yield* Story.assert('every Adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
