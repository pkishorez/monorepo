import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Count = ValueESchema.make('Count', Schema.String)
  .evolve('v2', Schema.Number, (previous) => Number(previous))
  .build();

export const bareValue = Story.make({
  title: 'What happens to a bare value with no envelope?',
  description:
    'It is treated as earliest-version data — the adoption path for values.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

Legacy storage holds raw values, not envelopes — a column of plain strings
written long before ValueESchema existed:

\`\`\`ts
'42'   // just the value, no { _v, value } around it
\`\`\`

## Answer

Same philosophy as unstamped structs: **a bare value is adopted as the
earliest version**. Decode validates it against v1's codec and folds it
forward — here through the string→number migration — with no ceremony.

\`\`\`ts
yield* Count.decode('42'); // → 42 (a number)
\`\`\`

Re-encoding writes the modern envelope, so adopted data upgrades itself in
storage as it is naturally read and written back.
`,
  run: Effect.gen(function* () {
    const adopted = yield* Story.exec(
      'decode a bare legacy string',
      Count.decode('42'),
    );
    yield* Story.assert(
      'the bare value was adopted as v1 and migrated',
      adopted === 42,
    );

    const reEncoded = yield* Story.exec(
      're-encode the adopted value',
      Count.encode(adopted),
    );
    yield* Story.assert(
      'writing it back produces a modern envelope',
      reEncoded._v === 'v2' && reEncoded.value === 42,
    );
  }),
});
