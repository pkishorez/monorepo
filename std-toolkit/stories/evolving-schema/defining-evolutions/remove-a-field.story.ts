import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Note = ESchema.make('Note', {
  body: Schema.String,
  colour: Schema.String,
})
  .evolve('v2', { pinned: Schema.Boolean }, (previous) => ({
    ...previous,
    pinned: false,
  }))
  .evolve('v3', { colour: null }, ({ colour: _colour, ...rest }) => rest)
  .build();

export const removeAField = Story.make({
  title: 'Colour is dropped',
  description:
    'Rung two: the notebook stops colouring notes, and the colour already in storage stops surfacing.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Every note in storage still has a colour on it. What does the app see now that colour is gone from the schema?',
      {
        answer:
          'No colour at all. The v2→v3 migration drops it while decoding, so code written against the latest Note never learns the field existed.',
        proof: Effect.gen(function* () {
          const migrated = yield* Note.decode({
            _v: 'v1',
            body: 'Buy milk',
            colour: 'yellow',
          });
          yield* Story.assert(
            'the dropped field is gone after decode',
            !('colour' in migrated),
          );
          yield* Story.assert(
            'the rest of the note came through both rungs',
            migrated.body === 'Buy milk' && migrated.pinned === false,
          );
          return migrated;
        }),
      },
    ),
    Story.question('What gets written back when the app saves that note?', {
      answer:
        'A v3 row with no colour on it. The old field leaves storage the first time each note is written back.',
      proof: Effect.gen(function* () {
        const migrated = yield* Note.decode({
          _v: 'v1',
          body: 'Buy milk',
          colour: 'yellow',
        });
        const encoded = yield* Note.encode(migrated);
        yield* Story.assert(
          'the note is stamped at the latest version',
          encoded._v === 'v3',
        );
        yield* Story.assert(
          'the dropped field is not written back',
          !('colour' in encoded),
        );
        return encoded;
      }),
    }),
  ],
});
