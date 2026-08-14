import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';
import { Snapshot } from 'std-toolkit/snapshot';

const approved = ESchema.make('Ticket', {
  subject: Schema.String,
}).build();

const evolved = ESchema.make('Ticket', {
  subject: Schema.String,
})
  .evolve('v2', { priority: Schema.Number }, (previous) => ({
    ...previous,
    priority: 3,
  }))
  .build();

const editedInPlace = ESchema.make('Ticket', {
  subject: Schema.String,
  priority: Schema.Number,
}).build();

export const snapshotGuard = Story.make({
  title: 'How do I catch a breaking change before it ships?',
  description:
    'Snapshot the approved contract; the diff classifies appends as safe and edits as breaking.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

The runtime cannot tell an honest evolution from an edited shipped version —
both just *are* the schema by the time code runs. The check has to happen
earlier, against a record of what was previously approved.

## Answer

\`Snapshot.capture\` serializes every version of a schema's contract — encoded
side, decoded side, transformations. Commit the approved snapshot; in CI, diff
the current schema against it:

\`\`\`ts
const before = Snapshot.capture(approvedSchema);   // committed at review time
const after = Snapshot.capture(currentSchema);     // built from today's code
const changes = Snapshot.diff(before, after);
\`\`\`

The diff classifies every change:

- **appending the next version** → \`safe\`
- **editing an approved version's shape** → \`breaking\`
- migration bodies and cosmetic annotations → deliberately ignored

Fail the build on any \`breaking\` classification and the "just add a field to
v1" mistake can never reach production.
`,
  run: Effect.gen(function* () {
    const verdicts = yield* Story.exec(
      'diff an honest evolution and an in-place edit against the approved snapshot',
      Effect.sync(() => {
        const before = Snapshot.capture(approved);
        return {
          evolved: Snapshot.diff(before, Snapshot.capture(evolved)),
          edited: Snapshot.diff(before, Snapshot.capture(editedInPlace)),
        };
      }),
    );
    yield* Story.assert(
      'appending v2 is classified safe',
      verdicts.evolved.length > 0 &&
        verdicts.evolved.every((change) => change.classification === 'safe'),
    );
    yield* Story.assert(
      'editing approved v1 is classified breaking',
      verdicts.edited.some((change) => change.classification === 'breaking'),
    );
  }),
});
