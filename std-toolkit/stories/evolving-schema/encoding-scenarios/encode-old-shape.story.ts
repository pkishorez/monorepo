import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Invoice = ESchema.make('Invoice', {
  amount: Schema.Number,
})
  .evolve('v2', { currency: Schema.String }, (previous) => ({
    ...previous,
    currency: 'USD',
  }))
  .build();

export const encodeOldShape = Story.make({
  title: 'Encode old shape',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens when I encode a v1-shaped value directly?', {
      answer:
        'Encode refuses with `Encode failed` — it only speaks the latest shape, and migrations run on decode, never encode.',
      proof: Effect.gen(function* () {
        const refused = yield* Effect.flip(
          Invoice.encode({ amount: 100 } as never),
        );
        yield* Story.assert(
          'encode refuses old shapes',
          refused instanceof ESchemaError &&
            refused.message === 'Encode failed',
        );
        return refused;
      }),
    }),
    Story.question('How do I upgrade an old-shaped value so it encodes?', {
      answer:
        'Round-trip it — decode the stored form so the v1→v2 migration supplies the missing fields, then encode.',
      proof: Effect.gen(function* () {
        const current = yield* Invoice.decode({ _v: 'v1', amount: 100 });
        const stored = yield* Invoice.encode(current);
        yield* Story.assert(
          'the round-trip lands at the latest version',
          stored._v === 'v2',
        );
        yield* Story.assert(
          'the migration supplied the new field',
          stored.currency === 'USD',
        );
        return stored;
      }),
    }),
  ],
});
