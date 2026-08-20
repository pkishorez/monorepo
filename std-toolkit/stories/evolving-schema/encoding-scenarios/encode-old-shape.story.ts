import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { ESchemaError } from 'std-toolkit/eschema';

import { Note } from '../support.js';

export const encodeOldShape = Story.make({
  title: 'Migrations only run downhill',
  description:
    'Decode climbs the ladder. Encode does not — it only ever speaks the latest shape.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Some old code still builds a note the v1 way. Can it save one?',
      {
        answer:
          'No. Encode refuses it. Migrations run on the way out of storage, never on the way in, so encode has no rung to climb and simply rejects the shape.',
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
    Story.question('So how does that old note get saved at all?', {
      answer:
        'Send it through storage first: decode the stored row so the ladder runs, then encode what comes back.',
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
