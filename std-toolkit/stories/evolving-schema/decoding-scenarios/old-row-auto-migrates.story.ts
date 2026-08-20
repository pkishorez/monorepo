import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const oldRowAutoMigrates = Story.make({
  title: 'Reading an old note',
  description:
    'Nothing asks for a migration. Reading the note is what runs one.',
  spine: true,
  setupNote: 'The completed Note from `support.ts`. Its newest version is v4.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The app knows only the newest Note. How does it read a note from three versions ago?',
      {
        answer:
          'It calls `decode` and does nothing else. The runtime reads the stamp on the stored row. It checks the row against that version. It then runs each step above that version and returns the result.',
        proof: Effect.gen(function* () {
          const note = yield* Note.decode({
            _v: 'v1',
            body: 'Buy milk',
            colour: 'yellow',
          });
          yield* Story.assert(
            'the caller is handed the latest shape',
            note.text === 'Buy milk' && note.pinned === false,
          );
          yield* Story.assert(
            'nothing from the old shape leaked through',
            !('body' in note) && !('colour' in note),
          );
          return note;
        }),
      },
    ),
    Story.question('Does the app learn which version the note came from?', {
      answer:
        'No. The stamp belongs to storage. `decode` removes it before the value reaches the caller.',
      proof: Effect.gen(function* () {
        const note = yield* Note.decode({
          _v: 'v1',
          body: 'Buy milk',
          colour: 'yellow',
        });
        yield* Story.assert('no version stamp on the value', !('_v' in note));
        return note;
      }),
    }),
  ],
});
