import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const reservedUnderscore = Story.make({
  title: 'The stamp you never wrote',
  description:
    'Storage carries one field the notebook never declared, and the `_` prefix is reserved so it can never collide.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note is saved. What is in storage that the app never put there?',
      {
        answer:
          'The version stamp, `_v`. The whole `_` prefix is reserved for the runtime, so a field of your own can never collide with it.',
        proof: Effect.gen(function* () {
          const stored = yield* Note.encode({
            text: 'Buy milk',
            pinned: false,
          });
          yield* Story.assert(
            'the runtime stamped the stored row',
            stored._v === 'v4',
          );
          return stored;
        }),
      },
    ),
    Story.question('Does the app ever have to deal with it?', {
      answer:
        'No. Decode strips the stamp back off, so it exists in storage and nowhere else.',
      proof: Effect.gen(function* () {
        const stored = yield* Note.encode({ text: 'Buy milk', pinned: false });
        const note = yield* Note.decode(stored);
        yield* Story.assert('the stamp is gone again', !('_v' in note));
        return note;
      }),
    }),
  ],
});
