import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Profile = ESchema.make('Profile', {
  nickname: Schema.NullOr(Schema.String),
})
  .evolve(
    'v2',
    { displayName: Schema.String, nickname: null },
    ({ nickname }) => ({
      displayName:
        nickname === null || nickname.trim() === '' ? 'anonymous' : nickname,
    }),
  )
  .build();

export const totalMigrations = Story.make({
  title: 'Why must a migration handle every possible old value?',
  description:
    'The migration runs on whatever v1 actually stored — including the values you forgot exist.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

v1 stored \`nickname\` as nullable, and real data has all three cases: a normal
name, \`null\`, and — because real data — the empty string.

## Answer

A migration is called for **every** row of its era, years after you wrote it,
with no way to ask questions. It must be *total* over the previous version's
decoded type: every null, every empty string, every legacy oddity must map to
a valid new value.

\`\`\`ts
.evolve('v2', { displayName: Schema.String, nickname: null }, ({ nickname }) => ({
  displayName:
    nickname === null || nickname.trim() === '' ? 'anonymous' : nickname,
}))
\`\`\`

A partial migration — one that throws, or returns something the next version's
schema rejects — doesn't fail at deploy time. It fails **on read**, months
later, on the one row that hit the forgotten case.
`,
  run: Effect.gen(function* () {
    const named = yield* Story.exec(
      'migrate the happy case',
      Profile.decode({ _v: 'v1', nickname: 'ada' }),
    );
    yield* Story.assert(
      'a real nickname carries over',
      named.displayName === 'ada',
    );

    const nullCase = yield* Story.exec(
      'migrate the null the schema always allowed',
      Profile.decode({ _v: 'v1', nickname: null }),
    );
    yield* Story.assert(
      'null maps to a valid fallback',
      nullCase.displayName === 'anonymous',
    );

    const emptyCase = yield* Story.exec(
      'migrate the empty string nobody remembers writing',
      Profile.decode({ _v: 'v1', nickname: '   ' }),
    );
    yield* Story.assert(
      'even the forgotten case maps somewhere sensible',
      emptyCase.displayName === 'anonymous',
    );
  }),
});
