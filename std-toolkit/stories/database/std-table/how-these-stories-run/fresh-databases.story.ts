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
    'Each proof receives an empty database and gives it back at the end.',
  setupNote:
    'One program, run two times on each database, to show that the second run starts empty.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Each proof writes notes into a real database. What stops the next proof from finding them?',
      {
        answer:
          'The proof releases its database when it finishes. The DynamoDB table is deleted. The IndexedDB database is dropped. The Memory table becomes unreachable. The SQLite connection is closed. The next proof therefore starts empty.',
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
      },
    ),
    Story.question('Does that still happen when a proof fails?', {
      answer: 'Yes. The release runs whether the proof passes or fails.',
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
