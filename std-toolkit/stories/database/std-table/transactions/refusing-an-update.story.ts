import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };

export const refusingAnUpdate = Story.make({
  title: 'Refusing an update',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does a business rule veto a transaction after reading the row?',
      {
        answer:
          'Return null from the update function in `getAndUpdateOp` — building the op fails with `UpdateRefused`, so the transaction is never submitted and sibling ops never land.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert({ ...key, title: 'Draft', status: 'done' });
              const error = yield* Effect.all([
                note.getAndUpdateOp(key, (current) =>
                  current.status === 'done' ? null : { status: 'done' },
                ),
                note.insertOp({
                  noteId: 'n2',
                  notebook: 'work',
                  title: 'Sibling',
                  status: 'open',
                }),
              ]).pipe(Effect.flip);
              const sibling = yield* note.get({
                noteId: 'n2',
                notebook: 'work',
              });
              const original = yield* note.get(key);
              return {
                reason: reasonOf(error),
                siblingWritten: sibling !== null,
                stampUntouched: original !== null,
                status: original?.value.status ?? null,
              };
            }),
          );
          yield* Story.assert(
            'the refused op fails with UpdateRefused and nothing is written',
            results.sqlite.reason === 'UpdateRefused' &&
              !results.sqlite.siblingWritten &&
              results.sqlite.status === 'done',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
