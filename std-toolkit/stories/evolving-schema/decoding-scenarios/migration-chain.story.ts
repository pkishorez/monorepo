import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { Note } from '../support.js';

export const migrationChain = Story.make({
  title: 'Only the rungs above you',
  description:
    'A note does not start at the first version. It starts where it already is.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook holds notes from each version. Does each note run every step?',
      {
        answer:
          'No. `decode` starts at the version on the note. It runs only the steps above that version. A v3 note therefore does not repeat the steps that it already went through.',
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
    Story.question(
      'What happens to a note that is already at the newest version?',
      {
        answer: 'No step runs. The note passes through unchanged.',
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
      },
    ),
  ],
});
