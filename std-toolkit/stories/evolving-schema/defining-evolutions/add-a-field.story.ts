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
  .build();

export const addAField = Story.make({
  title: 'Notes can be pinned',
  description:
    'Rung one of the ladder: `pinned` joins the Note, and notes written before it still decode.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note was written last year, before pinning existed. What does the app see when it reads that note today?',
      {
        answer:
          'A pinned field that is false. The v1→v2 migration backfills it on the way out of storage, and the rest of the note is untouched.',
        proof: Effect.gen(function* () {
          const migrated = yield* Note.decode({
            _v: 'v1',
            body: 'Buy milk',
            colour: 'yellow',
          });
          yield* Story.assert(
            'the old note gained the new field',
            migrated.pinned === false,
          );
          yield* Story.assert(
            'everything the note already had survived',
            migrated.body === 'Buy milk' && migrated.colour === 'yellow',
          );
          return migrated;
        }),
      },
    ),
    Story.question('And a note written since pinning shipped?', {
      answer:
        'It skips the migration entirely — it is already at the latest version, so nothing runs.',
      proof: Effect.gen(function* () {
        const fresh = yield* Note.decode({
          _v: 'v2',
          body: 'Call Ada',
          colour: 'blue',
          pinned: true,
        });
        yield* Story.assert(
          'the note keeps the value it was written with',
          fresh.pinned === true,
        );
        return fresh;
      }),
    }),
  ],
});
