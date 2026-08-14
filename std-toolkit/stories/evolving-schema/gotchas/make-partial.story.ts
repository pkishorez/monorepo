import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.String,
  fontSize: Schema.Number,
}).build();

export const makePartialValidates = Story.make({
  title: 'Does makePartial validate anything?',
  description:
    'No — it stamps _v onto whatever partial you hand it. It is a typing convenience, not a codec.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

Patch-style updates want to store *part* of a row with its version:

\`\`\`ts
Settings.makePartial({ theme: 'dark' });
// { theme: 'dark', _v: 'v1' }
\`\`\`

## Answer

\`makePartial\` does exactly one thing: spread your partial and attach
\`_v: latestVersion\`. **No validation, no encoding.** Three consequences to
internalize:

- an empty partial is happily produced — \`makePartial({})\` → \`{ _v: 'v1' }\`;
- transformed fields stay in their **decoded** form (a string-stored number
  remains a number) — no field codec runs;
- typos and wrong shapes are caught only by TypeScript, never at runtime.

Use it to type patches heading into a partial-update API. When the data needs
to be *trusted* — validated, transformed, storage-shaped — that is \`encode\`'s
job.
`,
  run: Effect.gen(function* () {
    const patch = yield* Story.exec(
      'stamp a partial update',
      Effect.sync(() => Settings.makePartial({ theme: 'dark' })),
    );
    yield* Story.assert(
      'the partial is stamped with the latest version',
      patch._v === 'v1',
    );
    yield* Story.assert(
      'unmentioned fields are simply absent',
      !('fontSize' in patch),
    );

    const empty = yield* Story.exec(
      'stamp an empty partial',
      Effect.sync(() => Settings.makePartial({})),
    );
    yield* Story.assert(
      'even an empty partial is produced without complaint',
      empty._v === 'v1' && Object.keys(empty).length === 1,
    );
  }),
});
