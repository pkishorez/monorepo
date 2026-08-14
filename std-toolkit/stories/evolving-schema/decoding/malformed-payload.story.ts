import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Metric = ESchema.make('Metric', {
  count: Schema.Number,
})
  .evolve('v2', { unit: Schema.String }, (previous) => ({
    ...previous,
    unit: 'items',
  }))
  .build();

export const malformedPayload = Story.make({
  title: 'What if the data does not match the version it claims?',
  description:
    'The payload is validated against its own version before any migration runs.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A payload that *says* v1 but does not look like v1:

\`\`\`ts
{ _v: 'v1', count: 'not-a-number' }
\`\`\`

## Answer

Before any migration runs, the payload is decoded with **its declared
version's** schema. Corrupt data fails right there with \`Decode failed\` — the
migration chain never sees it.

That ordering is what lets migrations be simple: a migration's input is
guaranteed to be a *valid* instance of the previous version, so it never needs
defensive checks of its own.

The version-specific detail (which field, what was expected) travels in the
error's \`cause\`, not the message.
`,
  run: Effect.gen(function* () {
    const error = yield* Story.exec(
      'decode a corrupt payload claiming to be v1',
      Effect.flip(Metric.decode({ _v: 'v1', count: 'not-a-number' })),
    );
    yield* Story.assert(
      'validation failed before any migration ran',
      error instanceof ESchemaError && error.message === 'Decode failed',
    );

    const valid = yield* Story.exec(
      'decode a healthy v1 payload for contrast',
      Metric.decode({ _v: 'v1', count: 3 }),
    );
    yield* Story.assert(
      'a valid payload of the same version sails through',
      valid.unit === 'items',
    );
  }),
});
