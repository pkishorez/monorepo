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
    'The status of a note is one value. It changes version in the same way that an object does.',
  spine: true,
  setupNote:
    'A `NoteStatus` value. v1 is free text. v2 is one of two words. The migration maps the old text onto the new words.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook stored the status of a note as free text. It now stores one of two words. What happens to the statuses that are already written?',
      {
        answer:
          'They move forward when they are read, in the same way that a field of an object does. Each step replaces the whole codec, so v1 text becomes a v2 word.',
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
        'In an envelope. A bare `"done"` has no space for a stamp, so storage writes it as `{ _v, value }`.',
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
