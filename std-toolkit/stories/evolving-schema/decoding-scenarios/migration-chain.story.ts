import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const migrationChain = Story.make({
  title: 'Only the rungs above you',
  description:
    'A note is not migrated from the beginning — it is migrated from wherever it already is.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook holds notes written at every version. Does each one run the whole ladder?',
      {
        answer:
          'No. Decode starts at the version the note is stamped with and runs only the rungs above it, so a v3 note never reruns the rungs it already went through.',
        proof: Story.trace(
          Effect.gen(function* () {
            const fromV3 = yield* Note.decode({
              _v: 'v3',
              body: 'Call Ada',
              pinned: true,
            });
            yield* Story.assert(
              'the v3→v4 rung ran',
              fromV3.text === 'Call Ada',
            );
            yield* Story.assert(
              'the earlier rungs did not rerun — pinned was left alone',
              fromV3.pinned === true,
            );
            return fromV3;
          }),
        ),
      },
    ),
    Story.question('And a note already written at the latest version?', {
      answer: 'No migration runs at all. It passes straight through.',
      proof: Effect.gen(function* () {
        const fromV4 = yield* Note.decode({
          _v: 'v4',
          text: 'Ship the release',
          pinned: true,
        });
        yield* Story.assert(
          'a latest-version note passes straight through',
          fromV4.text === 'Ship the release' && fromV4.pinned === true,
        );
        return fromV4;
      }),
    }),
  ],
});
