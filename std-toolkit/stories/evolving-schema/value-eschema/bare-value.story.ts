import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Count = ValueESchema.make('Count', Schema.String)
  .evolve('v2', Schema.Number, (previous) => Number(previous))
  .build();

export const bareValue = Story.make({
  title: 'Bare value',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a bare legacy value with no envelope is decoded?',
      {
        answer:
          "It is adopted as earliest-version data — validated against v1 and folded forward, so `'42'` becomes `42`.",
        proof: Effect.gen(function* () {
          const adopted = yield* Count.decode('42');
          yield* Story.assert(
            'the bare value was adopted as v1 and migrated',
            adopted === 42,
          );
          return adopted;
        }),
      },
    ),
    Story.question(
      'What happens when the adopted value is written back to storage?',
      {
        answer:
          'Encode produces a modern `{ _v, value }` envelope, so adopted data upgrades itself as it is read and rewritten.',
        proof: Effect.gen(function* () {
          const adopted = yield* Count.decode('42');
          const reEncoded = yield* Count.encode(adopted);
          yield* Story.assert(
            'writing it back produces a modern envelope',
            reEncoded._v === 'v2' && reEncoded.value === 42,
          );
          return reEncoded;
        }),
      },
    ),
  ],
});
