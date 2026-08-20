import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const PerPage = ValueESchema.make('PerPage', Schema.String)
  .evolve('v2', Schema.Number, (previous) => Number(previous))
  .build();

export const bareValue = Story.make({
  title: 'Values written before any of this existed',
  description:
    'A setting that was stored as a plain value, with no envelope and no stamp, can still be read.',
  setupNote:
    'A `PerPage` value. v1 is text. v2 is a number. The migration converts one to the other.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook stored the number of notes per page as the text `"20"`, before versions existed. Can it still be read?',
      {
        answer:
          'Yes. A value with no envelope is read as the first version. The system checks it against v1 and then runs the steps, so `"20"` arrives as `20`.',
        proof: Effect.gen(function* () {
          const adopted = yield* PerPage.decode('20');
          yield* Story.assert(
            'the bare value was adopted as v1 and migrated',
            adopted === 20,
          );
          return adopted;
        }),
      },
    ),
    Story.question('What happens when that value is written back?', {
      answer:
        'It comes back as an envelope. An old value therefore updates itself the first time that it is read and saved.',
      proof: Effect.gen(function* () {
        const adopted = yield* PerPage.decode('20');
        const stored = yield* PerPage.encode(adopted);
        yield* Story.assert(
          'writing it back produces a modern envelope',
          stored._v === 'v2' && stored.value === 20,
        );
        return stored;
      }),
    }),
  ],
});
