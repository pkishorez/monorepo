import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { NoteEntity } from '../support.js';

export const entityIdField = Story.make({
  title: 'The note keeps its identity',
  description:
    'An entity names one field as its identity, and no rung of the ladder is allowed to touch it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note is migrated across versions. Is it still the same note afterwards?',
      {
        answer:
          'Yes. The id field is added to every version automatically and no evolution may rename, drop, or retype it, so identity is the one thing the ladder cannot move.',
        proof: Effect.gen(function* () {
          const note = yield* NoteEntity.decode({
            _v: 'v1',
            noteId: 'n1',
            notebook: 'work',
            text: 'Buy milk',
            pinned: false,
          });
          yield* Story.assert(
            'the note came back under the same identity',
            note.noteId === 'n1',
          );
          yield* Story.assert(
            'the value carries no version stamp',
            !('_v' in note),
          );
          return note;
        }),
      },
    ),
    Story.question('And when that note is written back?', {
      answer:
        'It is stored under the same identity at the latest version — the key the rest of the notebook references it by never moves.',
      proof: Effect.gen(function* () {
        const note = yield* NoteEntity.decode({
          _v: 'v1',
          noteId: 'n1',
          notebook: 'work',
          text: 'Buy milk',
          pinned: false,
        });
        const stored = yield* NoteEntity.encode(note);
        yield* Story.assert(
          'the stored row keeps the same identity',
          stored.noteId === 'n1' && stored._v === 'v1',
        );
        return stored;
      }),
    }),
  ],
});
