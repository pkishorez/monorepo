import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const oldRowAutoMigrates = Story.make({
  title: 'Reading an old note',
  description:
    'Nothing in the app asks for a migration; reading the note is what runs it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The app was written against the newest Note and knows nothing about older ones. How does it read a note from three versions ago?',
      {
        answer:
          'By calling `decode`, and nothing else. The runtime reads the stamp on the stored row, validates the row against that version, then folds it forward to the latest shape before handing it back.',
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
    Story.question('Does the app ever see which version the note came from?', {
      answer:
        'No. The stamp is a storage concern, and decode strips it before the value reaches the caller.',
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
