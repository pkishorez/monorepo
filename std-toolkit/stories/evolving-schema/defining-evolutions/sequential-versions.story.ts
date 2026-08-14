import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Counter = ESchema.make('Counter', {
  count: Schema.Number,
})
  .evolve('v2', { step: Schema.Number }, (previous) => ({
    ...previous,
    step: 1,
  }))
  .evolve('v3', { label: Schema.String }, (previous) => ({
    ...previous,
    label: 'counter',
  }))
  .build();

export const sequentialVersions = Story.make({
  title: 'Sequential versions',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a v1 payload is decoded through a v1→v2→v3 chain?',
      {
        answer:
          'Decode folds it through every migration in order, so both steps run and the original data survives.',
        proof: Story.trace(
          Effect.gen(function* () {
            const migrated = yield* Counter.decode({ _v: 'v1', count: 2 });
            yield* Story.assert('the v1→v2 step ran', migrated.step === 1);
            yield* Story.assert(
              'the v2→v3 step ran after it',
              migrated.label === 'counter',
            );
            yield* Story.assert(
              'original data survived the walk',
              migrated.count === 2,
            );
            return migrated;
          }),
        ),
      },
    ),
    Story.question('What does the schema report as its latest version?', {
      answer:
        'The end of the chain, `v3` — which is why the sequence can have no holes.',
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'the schema reports the end of the chain',
          Counter.latestVersion === 'v3',
        );
        return Counter.latestVersion;
      }),
    }),
  ],
});
