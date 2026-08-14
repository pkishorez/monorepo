import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Widget = ESchema.make('Widget', {
  name: Schema.String,
}).build();

export const unknownVersion = Story.make({
  title: 'What if _v names a version I never declared?',
  description:
    'Decode refuses with "Unknown schema version" — no guessing, no coercion.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A payload stamped with a version this schema has never heard of:

\`\`\`ts
{ _v: 'v99', name: 'flux capacitor' }
\`\`\`

This happens in real systems: a newer writer's rows read by an older reader,
a typo in hand-written data, or an entry from a different schema entirely.

## Answer

The decode fails immediately with a precise error:

\`\`\`
ESchemaError: Unknown schema version: v99
\`\`\`

Contrast the two stamp failure modes:

- **Missing \`_v\`** → benign: adopted as v1 (legacy data is expected).
- **Unknown \`_v\`** → fatal: the payload claims a contract this code does not
  have, and decoding it under any other version would be a silent lie.

If you see this error in production, a newer schema exists somewhere — deploy
the reader before the writer.
`,
  run: Effect.gen(function* () {
    const error = yield* Story.exec(
      'decode a payload from the future',
      Effect.flip(Widget.decode({ _v: 'v99', name: 'flux capacitor' })),
    );
    yield* Story.assert('the decode is refused', error instanceof ESchemaError);
    yield* Story.assert(
      'the error names the offending version',
      error.message === 'Unknown schema version: v99',
    );
  }),
});
