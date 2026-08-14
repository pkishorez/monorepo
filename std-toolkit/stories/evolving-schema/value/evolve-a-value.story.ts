import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Rating = ValueESchema.make('Rating', Schema.String)
  .evolve('v2', Schema.Number, (previous) =>
    previous === 'good' ? 4 : previous === 'bad' ? 1 : 3,
  )
  .build();

export const evolveAValue = Story.make({
  title: 'How does a single value evolve without an object around it?',
  description:
    'Each version replaces the whole codec, and storage wraps the value in a { _v, value } envelope.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A rating stored as prose — \`'good'\` / \`'bad'\` — that product now wants as a
number. There is no struct to hang a field delta on; the value *is* the data.

## Answer

\`ValueESchema\` versions the value directly. Two differences from structs:

1. **Each evolution replaces the whole codec.** v2 below is a \`number\` even
   though v1 was a \`string\` — no merging, just "the type is now this":

\`\`\`ts
const Rating = ValueESchema.make('Rating', Schema.String)
  .evolve('v2', Schema.Number, (previous) =>
    previous === 'good' ? 4 : previous === 'bad' ? 1 : 3,
  )
  .build();
\`\`\`

2. **Storage wraps the value in an envelope**, because a bare \`4\` has nowhere
   to carry its version stamp:

\`\`\`ts
yield* Rating.encode(4);
// { _v: 'v2', value: 4 }
\`\`\`

Decode unwraps the envelope, dispatches on its \`_v\`, and folds forward —
exactly the struct story, one level down.
`,
  run: Effect.gen(function* () {
    const migrated = yield* Story.exec(
      'decode a v1 envelope holding the old string form',
      Rating.decode({ _v: 'v1', value: 'good' }),
    );
    yield* Story.assert('the v1 string became a v2 number', migrated === 4);

    const encoded = yield* Story.exec(
      'encode a current rating',
      Rating.encode(5),
    );
    yield* Story.assert(
      'storage wraps the value in an envelope',
      encoded._v === 'v2' && encoded.value === 5,
    );
  }),
});
