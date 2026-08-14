import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.String,
  fontSize: Schema.Number,
}).build();

export const makePartialValidates = Story.make({
  title: 'makePartial',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does `makePartial` do to a partial update?', {
      answer:
        'It only spreads the partial and stamps `_v` with the latest version — no validation, no encoding, unmentioned fields stay absent.',
      proof: Effect.gen(function* () {
        const patch = Settings.makePartial({ theme: 'dark' });
        yield* Story.assert(
          'the partial is stamped with the latest version',
          patch._v === 'v1',
        );
        yield* Story.assert(
          'unmentioned fields are simply absent',
          !('fontSize' in patch),
        );
        return patch;
      }),
    }),
    Story.question('What happens when you hand it an empty partial?', {
      answer:
        'It happily produces `{ _v: "v1" }` — nothing checks that the patch contains anything, so trust must come from `encode`, not `makePartial`.',
      proof: Effect.gen(function* () {
        const empty = Settings.makePartial({});
        yield* Story.assert(
          'even an empty partial is produced without complaint',
          empty._v === 'v1' && Object.keys(empty).length === 1,
        );
        return empty;
      }),
    }),
  ],
});
