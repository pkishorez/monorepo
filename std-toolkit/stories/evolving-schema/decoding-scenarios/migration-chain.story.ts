import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Order = ESchema.make('Order', {
  total: Schema.Number,
})
  .evolve('v2', { currency: Schema.String }, (previous) => ({
    ...previous,
    currency: 'USD',
  }))
  .evolve('v3', { paid: Schema.Boolean }, (previous) => ({
    ...previous,
    paid: previous.total === 0,
  }))
  .build();

export const migrationChain = Story.make({
  title: 'Migration chain',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a v1 payload is decoded by a schema three versions deep?',
      {
        answer:
          'It walks every migration after its version in order — v1→v2 backfills `currency`, then v2→v3 derives `paid` from `total`.',
        proof: Story.trace(
          Effect.gen(function* () {
            const fromV1 = yield* Order.decode({ _v: 'v1', total: 0 });
            yield* Story.assert(
              'v1→v2 backfilled the currency',
              fromV1.currency === 'USD',
            );
            yield* Story.assert(
              'v2→v3 derived paid from the v1 data',
              fromV1.paid === true,
            );
            return fromV1;
          }),
        ),
      },
    ),
    Story.question('Does a v2 payload rerun the v1→v2 step?', {
      answer:
        "No — decode starts from the payload's own version, so only v2→v3 runs and the stored `currency` survives.",
      proof: Effect.gen(function* () {
        const fromV2 = yield* Order.decode({
          _v: 'v2',
          total: 25,
          currency: 'EUR',
        });
        yield* Story.assert(
          'the v1→v2 step was skipped — EUR survived',
          fromV2.currency === 'EUR',
        );
        yield* Story.assert('the v2→v3 step still ran', fromV2.paid === false);
        return fromV2;
      }),
    }),
    Story.question('What happens to a payload already at the latest version?', {
      answer: 'No migration runs at all — it passes straight through.',
      proof: Effect.gen(function* () {
        const fromV3 = yield* Order.decode({
          _v: 'v3',
          total: 10,
          currency: 'GBP',
          paid: true,
        });
        yield* Story.assert(
          'a latest-version payload passes straight through',
          fromV3.paid === true && fromV3.currency === 'GBP',
        );
        return fromV3;
      }),
    }),
  ],
});
