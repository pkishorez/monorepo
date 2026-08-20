import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf, table } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };

export const refusingAnUpdate = Story.make({
  title: 'Refusing an update',
  description: 'A condition can fail the whole batch before any of it is sent.',
  setupNote:
    'The `note` from `support.ts`, with a condition attached to one op.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note must not change after it is archived. How does the system apply that rule at commit time?',
      {
        answer:
          'Attach a condition to the op. `transact` runs it against the value that it reads at commit time. If the condition refuses, the batch fails before anything is sent, so the other ops do not land.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert({ ...key, title: 'Draft', status: 'done' });
              const error = yield* table
                .transact([
                  yield* note.getAndUpdateOp(
                    key,
                    { status: 'done' },
                    { check: (current) => current.status !== 'done' },
                  ),
                  yield* note.insertOp({
                    noteId: 'n2',
                    notebook: 'work',
                    title: 'Sibling',
                    status: 'open',
                  }),
                ])
                .pipe(Effect.flip);
              const sibling = yield* note.get({
                noteId: 'n2',
                notebook: 'work',
              });
              const original = yield* note.get(key);
              const reason = (error as { reason: { _tag: string } }).reason;
              return {
                reason: reasonOf(error),
                status:
                  reason._tag === 'TransactFailed'
                    ? ((
                        reason as unknown as {
                          operations: readonly { status: string }[];
                        }
                      ).operations[0]?.status ?? null)
                    : null,
                siblingWritten: sibling !== null,
                noteStatus: original?.value.status ?? null,
              };
            }),
          );
          yield* Story.assert(
            'the refused op reports `refused` and nothing is written',
            results.sqlite.reason === 'TransactFailed' &&
              results.sqlite.status === 'refused' &&
              !results.sqlite.siblingWritten &&
              results.sqlite.noteStatus === 'done',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
