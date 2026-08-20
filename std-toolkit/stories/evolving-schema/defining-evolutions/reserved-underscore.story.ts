import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const reservedUnderscore = Story.make({
  title: 'The stamp you never wrote',
  description:
    'Storage holds one field that the notebook did not declare. The `_` prefix is reserved, so your fields cannot collide with it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note is saved. What is in storage that the app did not put there?',
      {
        answer:
          'The version stamp, `_v`. The whole `_` prefix belongs to the runtime. A field of your own can therefore never collide with it.',
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
    Story.question('Does the app have to handle that field?', {
      answer:
        'No. `decode` removes the stamp. The stamp is in storage and nowhere else.',
      proof: Effect.gen(function* () {
        const stored = yield* Note.encode({ text: 'Buy milk', pinned: false });
        const note = yield* Note.decode(stored);
        yield* Story.assert('the stamp is gone again', !('_v' in note));
        return note;
      }),
    }),
  ],
});
