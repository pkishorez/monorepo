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
    'Each proof in this part runs on four databases at the same time. All four must agree.',
  spine: true,
  setupNote:
    '`parity` runs one program on each of the four databases. `agree` compares the four results.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A Story here says that a note was stored. Where was it stored?',
      {
        answer:
          'In all four at the same time: DynamoDB Local over HTTP, IndexedDB, an in-memory SQLite database, and the Memory adapter. `parity` returns what each one produced.',
        proof: Effect.gen(function* () {
          const results = yield* parity(Effect.succeed('same everywhere'));
          yield* Story.assert(
            'every Adapter ran the same program',
            JSON.stringify(Object.keys(results)) ===
              JSON.stringify(adapterNames),
          );
          yield* Story.assert('every Adapter agrees', agree(results));
          return { ...results, dynamodbEndpoint };
        }),
      },
    ),
    Story.question(
      'The four databases agree down to the update stamp. How is that possible?',
      {
        answer:
          'Each run receives the same sequence of update stamps. The stamps are not real ULIDs. A complete stored entity, with its metadata, can therefore be compared across the four databases.',
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
      },
    ),
  ],
});
