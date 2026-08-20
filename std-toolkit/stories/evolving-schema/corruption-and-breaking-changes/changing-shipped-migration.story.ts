import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const original = ESchema.make('Player', {
  name: Schema.String,
})
  .evolve('v2', { score: Schema.Number }, (previous) => ({
    ...previous,
    score: 0,
  }))
  .build();

export const changingShippedMigration = Story.make({
  title: 'Changing shipped migration',
  description:
    'If you rewrite a migration that has run, the same bytes decode in two ways.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a migration that has already run is rewritten?',
      {
        answer:
          'History divides. The same stored bytes decode to one value before the rewrite and to a different value after it.',
        proof: Effect.gen(function* () {
          const rewritten = ESchema.make('Player', {
            name: Schema.String,
          })
            .evolve('v2', { score: Schema.Number }, (previous) => ({
              ...previous,
              score: 100,
            }))
            .build();
          const beforeRewrite = yield* original.decode({
            _v: 'v1',
            name: 'ada',
          });
          const afterRewrite = yield* rewritten.decode({
            _v: 'v1',
            name: 'ada',
          });
          yield* Story.assert(
            'the original migration produced score 0',
            beforeRewrite.score === 0,
          );
          yield* Story.assert(
            'the rewrite produces score 100 from the same bytes',
            afterRewrite.score === 100,
          );
          yield* Story.assert(
            'identical stored rows now disagree',
            beforeRewrite.score !== afterRewrite.score,
          );
          return { beforeRewrite, afterRewrite };
        }),
      },
    ),
  ],
});
