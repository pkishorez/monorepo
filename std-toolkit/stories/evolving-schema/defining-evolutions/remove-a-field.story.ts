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
    'Step two. The notebook stops colouring notes. The colour in storage stops appearing.',
  spine: true,
  setupNote:
    'The Note now has two steps. v2 adds `pinned`. v3 removes `colour`.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Each note in storage still has a colour. The schema no longer has one. What does the app see?',
      {
        answer:
          'It sees no colour. The v2 to v3 migration removes the field during the read. Code written against the newest Note never learns that the field existed.',
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
    Story.question('What goes into storage when the app saves that note?', {
      answer:
        'A v3 row with no colour in it. The old field leaves storage the first time that each note is saved again.',
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
