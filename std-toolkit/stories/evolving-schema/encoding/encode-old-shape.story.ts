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
  title: 'Can I encode data shaped like an old version?',
  description:
    'No — encode only speaks the latest shape. Decode first; the migration is the upgrade path.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

An old v1-shaped value floating around in memory — perhaps read from a raw
database driver that bypassed \`decode\`:

\`\`\`ts
const oldShaped = { amount: 100 }; // v1 had no currency
yield* Invoice.encode(oldShaped);  // ✗ ESchemaError: Encode failed
\`\`\`

## Answer

Encode refuses. It validates against the **latest** schema, and a v1 shape is
missing v2's fields. Migrations run on *decode*, never on encode — encode has
no idea which old version your object resembles, and guessing would be worse.

The correct path is the round-trip: **decode the stored form, then encode**.
Decode is where the runtime knows the version (from \`_v\`) and can migrate
honestly:

\`\`\`ts
const current = yield* Invoice.decode({ _v: 'v1', amount: 100 });
// { amount: 100, currency: 'USD' }   ← migration did the upgrade
const stored = yield* Invoice.encode(current);
// { amount: 100, currency: 'USD', _v: 'v2' }
\`\`\`
`,
  run: Effect.gen(function* () {
    const refused = yield* Story.exec(
      'try to encode a v1-shaped value directly',
      Effect.flip(Invoice.encode({ amount: 100 } as never)),
    );
    yield* Story.assert(
      'encode refuses old shapes',
      refused instanceof ESchemaError && refused.message === 'Encode failed',
    );

    const upgraded = yield* Story.trace(
      'take the honest path: decode, then encode',
      Effect.gen(function* () {
        const current = yield* Invoice.decode({ _v: 'v1', amount: 100 });
        yield* Effect.log('decode migrated the v1 row to the latest shape');
        return yield* Invoice.encode(current);
      }).pipe(Effect.withSpan('decode-then-encode')),
    );
    yield* Story.assert(
      'the round-trip lands at the latest version',
      upgraded._v === 'v2',
    );
    yield* Story.assert(
      'the migration supplied the new field',
      upgraded.currency === 'USD',
    );
  }),
});
