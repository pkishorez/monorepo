import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { ESchemaError } from 'std-toolkit/eschema';

import { Note } from '../support.js';

export const encodeOldShape = Story.make({
  title: 'Migrations only run downhill',
  description:
    '`decode` moves a note forward. `encode` does not. It accepts the newest shape only.',
  setupNote: 'The completed Note from `support.ts`.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Some old code still builds a note in the v1 shape. Can it save one?',
      {
        answer:
          'No. `encode` refuses it. Migrations run when data leaves storage, not when it enters. `encode` has no step to run, so it rejects the shape.',
        proof: Effect.gen(function* () {
          const refused = yield* Effect.flip(
            Note.encode({ body: 'Buy milk', colour: 'yellow' } as never),
          );
          yield* Story.assert(
            'the old shape is refused',
            refused instanceof ESchemaError &&
              refused.message === 'Encode failed',
          );
          return refused;
        }),
      },
    ),
    Story.question('How does that note get saved?', {
      answer:
        'Read it first. `decode` runs the steps and returns the newest shape. Then `encode` that result.',
      proof: Effect.gen(function* () {
        const current = yield* Note.decode({
          _v: 'v1',
          body: 'Buy milk',
          colour: 'yellow',
        });
        const stored = yield* Note.encode(current);
        yield* Story.assert(
          'the round trip lands at the latest version',
          stored._v === 'v4',
        );
        yield* Story.assert(
          'the words survived the whole ladder',
          stored.text === 'Buy milk',
        );
        return stored;
      }),
    }),
  ],
});
