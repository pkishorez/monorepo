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
    'Step one. The Note gets a `pinned` field. Notes written before it still work.',
  spine: true,
  setupNote:
    'The Note at v1 has a `body` and a `colour`. One step is added. It is called v2, it adds `pinned`, and its migration sets `pinned` to false.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note was written last year. Pinning did not exist then. What does the app see when it reads that note today?',
      {
        answer:
          'It sees a `pinned` field that is false. The v1 to v2 migration adds the field as the note leaves storage. The other fields do not change.',
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
    Story.question(
      'What does the app see when it reads a note that was written after pinning shipped?',
      {
        answer:
          'It sees the value that the note was written with. The note is already at v2, so no migration runs.',
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
      },
    ),
  ],
});
