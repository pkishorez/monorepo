import { Effect, Schema, SchemaTransformation } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const StoredNumber = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (value) => Number(value),
      encode: (value) => String(value),
    }),
  ),
);

const Reading = ESchema.make('Reading', {
  celsius: StoredNumber,
})
  .evolve('v2', { fahrenheit: Schema.Number }, (previous) => ({
    ...previous,
    fahrenheit: previous.celsius * 1.8 + 32,
  }))
  .build();

export const transformedFields = Story.make({
  title: 'What if a field stores one type but decodes to another?',
  description:
    'Fields can be full codecs — and migrations always see the decoded side.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A field whose *stored* type and *program* type differ — persisted as a string,
used as a number:

\`\`\`ts
const StoredNumber = Schema.String.pipe(
  Schema.decodeTo(Schema.Number, SchemaTransformation.transform({
    decode: (value) => Number(value),
    encode: (value) => String(value),
  })),
);
\`\`\`

## Question

When the v1→v2 migration runs, which side does it see — the stored string or
the decoded number?

## Answer

**The decoded side, always.** The pipeline is: validate & decode the payload
with its version's schema *first*, then run migrations on the decoded values.
So the migration above receives \`celsius\` as a real \`number\` and can do
arithmetic on it directly.

Encode mirrors this: your decoded value goes in, each field's \`encode\` runs,
and the stored row comes out with strings — no migration ever touches the
encoded representation.
`,
  run: Effect.gen(function* () {
    const decoded = yield* Story.exec(
      'decode a v1 row whose celsius is stored as a string',
      Reading.decode({ _v: 'v1', celsius: '21.5' }),
    );
    yield* Story.assert(
      'the field decoded from string to number',
      decoded.celsius === 21.5,
    );
    yield* Story.assert(
      'the migration computed with the decoded number',
      decoded.fahrenheit === 21.5 * 1.8 + 32,
    );

    const encoded = yield* Story.exec(
      'encode the migrated value back to storage form',
      Reading.encode(decoded),
    );
    yield* Story.assert(
      'the stored side is a string again',
      encoded.celsius === '21.5',
    );
    yield* Story.assert('the stored row is stamped v2', encoded._v === 'v2');
  }),
});
