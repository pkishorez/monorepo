import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Bookmark = ESchema.make('Bookmark', {
  url: Schema.String,
})
  .evolve('v2', { starred: Schema.Boolean }, (previous) => ({
    ...previous,
    starred: false,
  }))
  .build();

export const missingVersionStamp = Story.make({
  title: 'What if the payload has no _v at all?',
  description:
    'Unstamped data is adopted as the earliest version — the door in for legacy tables.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A table that predates ESchema entirely — rows written by hand, an ORM, or a
previous system. No row carries a \`_v\`:

\`\`\`ts
{ url: 'https://effect.website' }
\`\`\`

## Answer

A missing stamp is **not an error**. The runtime assumes unstamped data is the
**earliest version** (v1), validates it against v1's schema, and folds it
forward like any other v1 row.

This is the adoption path: declare your existing table's current shape as v1,
and every legacy row immediately decodes — no backfill script, no flag day.

The safety net still holds: unstamped data that does *not* match v1's shape
fails loudly with \`Decode failed\` rather than being guessed at.
`,
  run: Effect.gen(function* () {
    const adopted = yield* Story.exec(
      'decode a legacy row that has never heard of _v',
      Bookmark.decode({ url: 'https://effect.website' }),
    );
    yield* Story.assert(
      'the legacy row was adopted as v1 and migrated',
      adopted.starred === false,
    );
    yield* Story.assert(
      'its data came through intact',
      adopted.url === 'https://effect.website',
    );

    const garbage = yield* Story.exec(
      'decode unstamped data that does not match v1',
      Effect.flip(Bookmark.decode({ nonsense: true })),
    );
    yield* Story.assert(
      'mismatched legacy data fails loudly',
      garbage instanceof ESchemaError && garbage.message === 'Decode failed',
    );
  }),
});
