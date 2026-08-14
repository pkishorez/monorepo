import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Task = ESchema.make('Task', {
  label: Schema.String,
})
  .evolve(
    'v2',
    { label: null, title: Schema.String },
    ({ label, ...rest }) => ({
      ...rest,
      title: label,
    }),
  )
  .build();

export const renameAField = Story.make({
  title: 'How do I rename a field?',
  description:
    'There is no rename operation — remove the old key and add the new one in a single delta.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

v1 called it \`label\`, but everything else in the product says \`title\`:

\`\`\`ts
const Task = ESchema.make('Task', {
  label: Schema.String,
}).build();
\`\`\`

## Answer

A rename is a **remove plus an add in one evolution**, with the migration
carrying the value across:

\`\`\`ts
.evolve('v2', { label: null, title: Schema.String }, ({ label, ...rest }) => ({
  ...rest,
  title: label,
}))
\`\`\`

There is deliberately no first-class rename: the delta records exactly what
happened to the *shape* (one key died, one key was born), and the migration
records that the *value* survived. Nothing about the stored v1 rows changes.
`,
  run: Effect.gen(function* () {
    const migrated = yield* Story.exec(
      'decode a v1 row written under the old name',
      Task.decode({ _v: 'v1', label: 'Ship the release' }),
    );
    yield* Story.assert(
      'the value now lives under the new name',
      migrated.title === 'Ship the release',
    );
    yield* Story.assert('the old name is gone', !('label' in migrated));
  }),
});
