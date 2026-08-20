import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { NoteEntity } from '../support.js';

export const entityIdField = Story.make({
  title: 'The note keeps its identity',
  description:
    'An entity names one field as its identity. No step may change that field.',
  spine: true,
  setupNote: 'A `NoteEntity` whose identity field is `noteId`.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note moves through several versions. Is it still the same note?',
      {
        answer:
          'Yes. The system adds the identity field to each version. No step may rename it, remove it, or change its type. The identity is therefore the one thing that a migration cannot move.',
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
    Story.question('What happens when that note is written back?', {
      answer:
        'It is stored under the same identity at the newest version. The key that the rest of the notebook uses does not move.',
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
