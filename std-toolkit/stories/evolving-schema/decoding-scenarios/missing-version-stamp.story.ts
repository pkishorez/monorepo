import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Bookmark = ESchema.make('Bookmark', {
  url: Schema.String,
})
  .evolve('v2', { starred: Schema.Boolean }, (previous) => ({
    ...previous,
    starred: false,
  }))
  .build();

export const missingVersionStamp = Story.make({
  title: 'Missing version stamp',
  description:
    'Data written before any stamp existed is adopted as the earliest version.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens when a payload has no `_v` at all?', {
      answer:
        'It is adopted as the earliest version: validated against v1 and folded forward like any other v1 row.',
      proof: Effect.gen(function* () {
        const adopted = yield* Bookmark.decode({
          url: 'https://effect.website',
        });
        yield* Story.assert(
          'the legacy row was adopted as v1 and migrated',
          adopted.starred === false,
        );
        yield* Story.assert(
          'its data came through intact',
          adopted.url === 'https://effect.website',
        );
        return adopted;
      }),
    }),
    Story.question(
      'What happens when unstamped data does not match the v1 shape?',
      {
        answer:
          'It fails loudly with `Decode failed` rather than being guessed at.',
        proof: Effect.gen(function* () {
          const garbage = yield* Effect.flip(
            Bookmark.decode({ nonsense: true }),
          );
          yield* Story.assert(
            'mismatched legacy data fails loudly',
            garbage instanceof ESchemaError &&
              garbage.message === 'Decode failed',
          );
          return garbage;
        }),
      },
    ),
  ],
});
