import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const shipped = ESchema.make('Event', {
  name: Schema.String,
}).build();

const edited = ESchema.make('Event', {
  name: Schema.String,
  kind: Schema.String,
}).build();

export const editingShippedVersion = Story.make({
  title: 'What happens if I edit a shipped version in place?',
  description:
    'Nothing stops you — and every row written before the edit silently breaks.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

v1 shipped, rows were written, and then someone "just adds" a field **to v1
itself** instead of evolving:

\`\`\`ts
// before the edit — rows exist shaped like this
ESchema.make('Event', { name: Schema.String })

// after the "harmless" edit
ESchema.make('Event', { name: Schema.String, kind: Schema.String })
\`\`\`

## Answer

This is the cardinal sin of evolving schemas, and **nothing catches it at
runtime**. The edited schema still calls itself v1, so old rows are validated
against the *new* v1 shape — and fail with \`Decode failed\`, because they have
no \`kind\`. New rows work fine, which is exactly what makes the breakage easy
to miss in development.

**v1 is forever.** Once data exists, a version's shape is a contract with that
data. The only safe change is an appended \`evolve\` — see the snapshot story
in this section for the tooling that catches this mistake in review.
`,
  run: Effect.gen(function* () {
    const row = yield* Story.exec(
      'write a row with the shipped v1 schema',
      shipped.encode({ name: 'deploy' }),
    );
    yield* Story.assert('the row was stored as v1', row._v === 'v1');

    const broken = yield* Story.exec(
      'read that same row after the in-place edit',
      Effect.flip(edited.decode(row)),
    );
    yield* Story.assert(
      'the pre-edit row no longer decodes',
      broken instanceof ESchemaError && broken.message === 'Decode failed',
    );

    const fresh = yield* Story.exec(
      'read a row written after the edit',
      edited.decode({ _v: 'v1', name: 'deploy', kind: 'ci' }),
    );
    yield* Story.assert(
      'post-edit rows work — hiding the breakage',
      fresh.kind === 'ci',
    );
  }),
});
