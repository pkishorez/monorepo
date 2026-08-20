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
  .evolve('v4', { body: null, text: Schema.String }, ({ body, ...rest }) => ({
    ...rest,
    text: body,
  }))
  .build();

export const renameAField = Story.make({
  title: 'Body becomes text',
  description:
    'Rung three: one field changes its name, and the words already written move across with it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note was written when the field was called `body`. Where did those words go?',
      {
        answer:
          'Into `text`. A rename is a remove and an add declared in one delta, and the migration is what carries the value between them.',
        proof: Effect.gen(function* () {
          const migrated = yield* Note.decode({
            _v: 'v1',
            body: 'Buy milk',
            colour: 'yellow',
          });
          yield* Story.assert(
            'the words now live under the new name',
            migrated.text === 'Buy milk',
          );
          yield* Story.assert('the old name is gone', !('body' in migrated));
          return migrated;
        }),
      },
    ),
  ],
});
