import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Session = ESchema.make('Session', {
  token: Schema.String,
})
  .evolve('v2', { device: Schema.String }, (previous) => ({
    ...previous,
    device: 'unknown',
  }))
  .build();

export const encodeWritesLatest = Story.make({
  title: 'What does encode actually write?',
  description:
    'Always the latest shape, always stamped — and extra keys are silently dropped.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A schema at v2 and a value in the latest shape:

\`\`\`ts
const stored = yield* Session.encode({ token: 'abc', device: 'mac' });
// { token: 'abc', device: 'mac', _v: 'v2' }
\`\`\`

## Answer

Encode is the mirror image of decode, minus the time travel: it validates the
value against the **latest** schema only, encodes it, and stamps
\`_v: latestVersion\`. There is no version dispatch and no backward migration —
new writes are always written at the present.

One asymmetry to know about:

- a **missing** field fails loudly (\`Encode failed\`),
- an **extra** field is **silently dropped** — the stored row contains exactly
  the declared shape, nothing more.

That second behavior is what keeps stray in-memory properties (and the \`_v\`
of a previously-decoded row) from leaking into storage.
`,
  run: Effect.gen(function* () {
    const stored = yield* Story.exec(
      'encode a value in the latest shape',
      Session.encode({ token: 'abc', device: 'mac' }),
    );
    yield* Story.assert(
      'the row is stamped with the latest version',
      stored._v === 'v2',
    );

    const withExtra = yield* Story.exec(
      'encode a value dragging an extra property along',
      Session.encode({ token: 'abc', device: 'mac', debugFlag: true } as never),
    );
    yield* Story.assert(
      'the extra property was silently dropped',
      !('debugFlag' in withExtra),
    );

    const missing = yield* Story.exec(
      'encode a value missing a declared field',
      Effect.flip(Session.encode({ token: 'abc' } as never)),
    );
    yield* Story.assert(
      'a missing field fails loudly',
      missing.message === 'Encode failed',
    );
  }),
});
