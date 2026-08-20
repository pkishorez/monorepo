import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const NoteStatus = ValueESchema.make('NoteStatus', Schema.String)
  .evolve('v2', Schema.Literals(['open', 'done']), (previous) =>
    previous === 'finished' ? 'done' : 'open',
  )
  .build();

export const evolveAValue = Story.make({
  title: 'A setting is not an object',
  description:
    "A note's status is one bare value, and it evolves on the same ladder objects do.",
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      "The notebook used to store a note's status as free text and now stores one of two words. What happens to the statuses already written?",
      {
        answer:
          'They migrate on read, exactly like a field of an object would. Each rung replaces the whole codec, so v1 text becomes a v2 literal.',
        proof: Effect.gen(function* () {
          const migrated = yield* NoteStatus.decode({
            _v: 'v1',
            value: 'finished',
          });
          yield* Story.assert(
            'the old text became one of the new words',
            migrated === 'done',
          );
          return migrated;
        }),
      },
    ),
    Story.question('Where does a bare value keep its version stamp?', {
      answer:
        'In an envelope. A bare `"done"` has nowhere to carry a stamp, so storage wraps it as `{ _v, value }`.',
      proof: Effect.gen(function* () {
        const stored = yield* NoteStatus.encode('done');
        yield* Story.assert(
          'storage wraps the value in an envelope',
          stored._v === 'v2' && stored.value === 'done',
        );
        return stored;
      }),
    }),
  ],
});
