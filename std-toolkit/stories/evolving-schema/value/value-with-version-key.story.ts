import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema, ESchemaError } from 'std-toolkit/eschema';

const Payload = ValueESchema.make(
  'Payload',
  Schema.Struct({ _v: Schema.String, value: Schema.String }),
).build();

export const valueWithVersionKey = Story.make({
  title: 'What if my value itself contains a _v key?',
  description:
    'A bare object with _v is mistaken for an envelope — the one ambiguity in envelope detection.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A value type that legitimately owns a \`_v\` property — say, a third-party
payload you store verbatim:

\`\`\`ts
const Payload = ValueESchema.make(
  'Payload',
  Schema.Struct({ _v: Schema.String, value: Schema.String }),
).build();
\`\`\`

## Answer

Envelope detection is structural: *"is it an object with a \`_v\` key?"* A
**bare** (unstamped) value of this type answers yes, gets mistaken for an
envelope, and fails — its business \`_v\` is read as a schema version:

\`\`\`ts
yield* Payload.decode({ _v: 'vendor-3', value: 'hello' });
// ✗ ESchemaError: Unknown schema version: vendor-3
\`\`\`

The ambiguity only exists on the **bare-value adoption path**. Properly
stamped data is unambiguous: the outer envelope is peeled exactly once, and
the inner object — business \`_v\` and all — round-trips untouched.

**Rule of thumb:** values whose type contains a \`_v\` key can't use bare-value
adoption; make sure such data enters storage through \`encode\` (stamped), not
verbatim.
`,
  run: Effect.gen(function* () {
    const collided = yield* Story.exec(
      'decode a bare value whose own _v shadows the stamp',
      Effect.flip(Payload.decode({ _v: 'vendor-3', value: 'hello' })),
    );
    yield* Story.assert(
      'the business _v was misread as a schema version',
      collided instanceof ESchemaError &&
        collided.message === 'Unknown schema version: vendor-3',
    );

    const stamped = yield* Story.exec(
      'round-trip the same value properly stamped',
      Effect.gen(function* () {
        const encoded = yield* Payload.encode({
          _v: 'vendor-3',
          value: 'hello',
        });
        return yield* Payload.decode(encoded);
      }),
    );
    yield* Story.assert(
      'stamped data is unambiguous — the inner _v survives',
      stamped._v === 'vendor-3' && stamped.value === 'hello',
    );
  }),
});
