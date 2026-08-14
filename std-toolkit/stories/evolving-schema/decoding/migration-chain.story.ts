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
  title: 'Does a v1 payload really walk every migration step?',
  description:
    'Decode folds forward one version at a time — each migration sees its own era.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A schema three versions deep, and payloads of every vintage still in storage:

\`\`\`ts
{ _v: 'v1', total: 0 }
{ _v: 'v2', total: 25, currency: 'EUR' }
{ _v: 'v3', total: 10, currency: 'GBP', paid: true }
\`\`\`

## Answer

Decode finds the payload's version in the chain and applies **every migration
after it, in order**. A v1 payload runs v1→v2 then v2→v3; a v2 payload runs
only v2→v3; a v3 payload runs none.

Each migration is written against exactly one input shape — the previous
version's — and can trust it completely, because the runtime already validated
the payload against that version's schema before folding.

Note the v2→v3 migration computes \`paid\` from \`total\`: migrations are not
limited to constants, they can derive the new field from the old data.
`,
  run: Effect.gen(function* () {
    const fromV1 = yield* Story.exec(
      'decode a v1 payload — two migration steps',
      Order.decode({ _v: 'v1', total: 0 }),
    );
    yield* Story.assert(
      'v1→v2 backfilled the currency',
      fromV1.currency === 'USD',
    );
    yield* Story.assert(
      'v2→v3 derived paid from the v1 data',
      fromV1.paid === true,
    );

    const fromV2 = yield* Story.exec(
      'decode a v2 payload — one migration step',
      Order.decode({ _v: 'v2', total: 25, currency: 'EUR' }),
    );
    yield* Story.assert(
      'the v1→v2 step was skipped — EUR survived',
      fromV2.currency === 'EUR',
    );
    yield* Story.assert('the v2→v3 step still ran', fromV2.paid === false);

    const fromV3 = yield* Story.exec(
      'decode a v3 payload — no migration at all',
      Order.decode({ _v: 'v3', total: 10, currency: 'GBP', paid: true }),
    );
    yield* Story.assert(
      'a latest-version payload passes straight through',
      fromV3.paid === true && fromV3.currency === 'GBP',
    );
  }),
});
