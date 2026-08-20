import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../../support.js';

const seed = {
  noteId: 'leftover',
  notebook: 'harness',
  title: 'Leftover',
  status: 'open',
};

export const freshDatabases = Story.make({
  title: 'Fresh databases',
  description:
    'Each proof gets an empty database and gives it back when it finishes.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens to the databases a question creates?', {
      answer:
        'They are released when the proof finishes — the DynamoDB table is deleted, the IndexedDB database is dropped, the Memory adapter table becomes unreachable, and the SQLite connection is closed — so the next proof starts empty.',
      proof: Effect.gen(function* () {
        yield* parity(note.insert(seed));
        const results = yield* parity(
          note.get({ noteId: 'leftover', notebook: 'harness' }),
        );
        yield* Story.assert(
          'a brand new database sees nothing from the previous one',
          results.sqlite === null,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('Are they still destroyed when a proof fails?', {
      answer:
        'Yes — teardown is a finalizer, so a failing program tears its databases down on the way out just like a passing one.',
      proof: Effect.gen(function* () {
        const failures = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(seed);
            return reasonOf(yield* note.insert(seed).pipe(Effect.flip));
          }),
        );
        const results = yield* parity(
          note.get({ noteId: 'leftover', notebook: 'harness' }),
        );
        yield* Story.assert(
          'the program really did fail',
          failures.sqlite === 'ItemAlreadyExists',
        );
        yield* Story.assert(
          'and left nothing behind for the next proof',
          results.sqlite === null,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return { failures, afterwards: results };
      }),
    }),
  ],
});
