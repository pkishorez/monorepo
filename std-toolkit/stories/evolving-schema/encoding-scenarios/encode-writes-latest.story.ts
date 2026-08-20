import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const encodeWritesLatest = Story.make({
  title: 'Writing a note back',
  description:
    'Every write lands at the latest version — storage only ever gains newer notes, never older ones.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Someone saves a note. What version does it land at?', {
      answer:
        'The latest, always. Encode validates against the newest shape and stamps `_v: "v4"`, so writing an old note back is what quietly retires its old version.',
      proof: Effect.gen(function* () {
        const stored = yield* Note.encode({ text: 'Buy milk', pinned: false });
        yield* Story.assert(
          'the note is stamped at the latest version',
          stored._v === 'v4',
        );
        return stored;
      }),
    }),
    Story.question(
      'The app tacked a scratch field onto the note before saving. What reaches storage?',
      {
        answer:
          'Only the declared shape. Anything the schema does not name is dropped rather than stored.',
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
    Story.question('And if a declared field is missing?', {
      answer: 'The write fails rather than storing a half-formed note.',
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
