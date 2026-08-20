import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const encodeWritesLatest = Story.make({
  title: 'Writing a note back',
  description:
    'Each write goes in at the newest version. Storage gains new notes only.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note is encoded for storage. Which version is stamped on it?',
      {
        answer:
          'The newest version, always. `encode` checks the value against the newest shape and stamps it `_v: "v4"`. Saving an old note is therefore what removes its old version from storage.',
        proof: Effect.gen(function* () {
          const stored = yield* Note.encode({
            text: 'Buy milk',
            pinned: false,
          });
          yield* Story.assert(
            'the note is stamped at the latest version',
            stored._v === 'v4',
          );
          return stored;
        }),
      },
    ),
    Story.question(
      'The app added an extra field to the note before it saved it. What reaches storage?',
      {
        answer:
          'Only the declared shape. The system removes any field that the schema does not name.',
        proof: Effect.gen(function* () {
          const stored = yield* Note.encode({
            text: 'Buy milk',
            pinned: false,
            draftOnly: true,
          } as never);
          yield* Story.assert(
            'the undeclared field never reached storage',
            !('draftOnly' in stored),
          );
          return stored;
        }),
      },
    ),
    Story.question('What happens when a declared field is absent?', {
      answer:
        'The write fails. The system does not store a note that is not complete.',
      proof: Effect.gen(function* () {
        const error = yield* Effect.flip(
          Note.encode({ text: 'Buy milk' } as never),
        );
        yield* Story.assert(
          'an incomplete note is refused',
          error.message === 'Encode failed',
        );
        return error;
      }),
    }),
  ],
});
