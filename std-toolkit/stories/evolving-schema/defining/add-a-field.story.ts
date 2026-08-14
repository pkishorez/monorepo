import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Profile = ESchema.make('Profile', {
  name: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();

export const addAField = Story.make({
  title: 'How do I add a field to a shipped schema?',
  description: 'Evolve with a delta and a migration that backfills the value.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A schema already in production, with rows written against it:

\`\`\`ts
const Profile = ESchema.make('Profile', {
  name: Schema.String,
}).build();
// stored: { _v: 'v1', name: 'Ada' }
\`\`\`

Now the product needs an \`age\` field — but the stored rows don't have one.

## Answer

Never touch v1. Append an evolution: the delta declares the new field, and the
migration says how to conjure it for every row that predates it.

\`\`\`ts
const Profile = ESchema.make('Profile', {
  name: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();
\`\`\`

Old rows decode through the migration and arrive with \`age: 0\`; new rows are
written at v2 with a real age. No table rewrite, no defensive \`?? 0\` at read
sites.
`,
  run: Effect.gen(function* () {
    const migrated = yield* Story.trace(
      'decode a v1 row through the v2 schema',
      Effect.gen(function* () {
        yield* Effect.log('A v1 row arrives: it has a name but no age');
        const decoded = yield* Profile.decode({ _v: 'v1', name: 'Ada' });
        yield* Effect.log('The v1→v2 migration backfilled age');
        return decoded;
      }).pipe(Effect.withSpan('decode-v1-profile')),
    );
    yield* Story.assert('the old row gained the new field', migrated.age === 0);
    yield* Story.assert('existing data is untouched', migrated.name === 'Ada');

    const fresh = yield* Story.exec(
      'decode a row already written at v2',
      Profile.decode({ _v: 'v2', name: 'Grace', age: 36 }),
    );
    yield* Story.assert('a v2 row skips the migration', fresh.age === 36);
  }),
});
