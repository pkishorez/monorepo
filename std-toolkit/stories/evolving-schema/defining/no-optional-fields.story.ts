import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Contact = ESchema.make('Contact', {
  name: Schema.String,
  phone: Schema.NullOr(Schema.String),
}).build();

export const noOptionalFields = Story.make({
  title: 'Why are optional fields forbidden?',
  description:
    'Optionals make a version ambiguous — model absence with Schema.NullOr instead.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

You want a field that is sometimes missing:

\`\`\`ts
ESchema.make('Contact', {
  name: Schema.String,
  phone: Schema.optionalKey(Schema.String), // ✗ compile error
})
\`\`\`

## Answer

The builder rejects optional fields at the type level. An optional field means
one version has *two* stored shapes — with the key and without it — and a
migration written against that version can no longer be sure what it receives.
Every version must have exactly one canonical shape.

Absence is data. Say it explicitly with \`NullOr\`:

\`\`\`ts
ESchema.make('Contact', {
  name: Schema.String,
  phone: Schema.NullOr(Schema.String), // ✓ absence is an explicit null
})
\`\`\`
`,
  run: Effect.gen(function* () {
    const withPhone = yield* Story.exec(
      'decode a contact that has a phone',
      Contact.decode({ _v: 'v1', name: 'Ada', phone: '+44 20 7946 0958' }),
    );
    yield* Story.assert(
      'a present value decodes as-is',
      withPhone.phone !== null,
    );

    const withoutPhone = yield* Story.exec(
      'decode a contact whose phone is explicitly null',
      Contact.decode({ _v: 'v1', name: 'Grace', phone: null }),
    );
    yield* Story.assert(
      'absence is an explicit null, not a missing key',
      withoutPhone.phone === null,
    );

    const missingKey = yield* Story.exec(
      'try to decode a contact where the key is simply missing',
      Effect.flip(Contact.decode({ _v: 'v1', name: 'Edsger' })),
    );
    yield* Story.assert(
      'a missing key is a decode error, never a silent undefined',
      missingKey.message === 'Decode failed',
    );
  }),
});
