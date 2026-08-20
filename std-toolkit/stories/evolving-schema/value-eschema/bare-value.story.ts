import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const PerPage = ValueESchema.make('PerPage', Schema.String)
  .evolve('v2', Schema.Number, (previous) => Number(previous))
  .build();

export const bareValue = Story.make({
  title: 'Values written before any of this existed',
  description:
    'A setting stored as a plain value, with no envelope and no stamp, still has a way in.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook stored "notes per page" long before versions existed — as the bare string `"20"`. Can it still be read?',
      {
        answer:
          'Yes. A value with no envelope is adopted as earliest-version data: validated against v1, then folded forward, so `"20"` arrives as `20`.',
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
    Story.question('And once it is written back?', {
      answer:
        'It comes back as a modern envelope. Legacy values upgrade themselves the first time they are read and saved.',
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
