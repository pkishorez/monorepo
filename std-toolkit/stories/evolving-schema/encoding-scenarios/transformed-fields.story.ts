import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

export const transformedFields = Story.make({
  title: 'Fields that change shape in storage',
  description:
    'A word count stored as text and read as a number needs a custom transformation. A Snapshot must be able to capture a field and restore a live schema from that capture alone, so a transformation is refused the moment the field is declared.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note stores its word count as text but the app wants a number. Can a field do that conversion?',
      {
        answer:
          'No. `ESchema.make` refuses the field immediately — before any data is ever decoded or encoded — because a custom transformation cannot be restored from a Snapshot alone.',
        proof: Effect.gen(function* () {
          const attempt = Effect.try(() =>
            ESchema.make('Note', {
              text: Schema.String,
              wordCount: Schema.NumberFromString,
            }).build(),
          );
          const failure = yield* Effect.flip(attempt);
          const cause = failure.cause;
          yield* Story.assert(
            'the field is refused at definition time',
            cause instanceof Error &&
              cause.name === 'UnrepresentableFieldError' &&
              cause.message.includes('wordCount'),
          );
          return { message: (cause as Error).message };
        }),
      },
    ),
    Story.question('So how does the note store its word count?', {
      answer:
        'As the number it already is. Store the field in the shape you want to keep, and the migration that adds it can still compute from other fields.',
      proof: Effect.gen(function* () {
        const Note = ESchema.make('Note', {
          text: Schema.String,
          wordCount: Schema.Number,
        })
          .evolve('v2', { long: Schema.Boolean }, (previous) => ({
            ...previous,
            long: previous.wordCount > 100,
          }))
          .build();

        const note = yield* Note.decode({
          _v: 'v1',
          text: 'Buy milk',
          wordCount: 140,
        });
        yield* Story.assert(
          'the migration computed from the plain field',
          note.long === true,
        );
        return note;
      }),
    }),
  ],
});
