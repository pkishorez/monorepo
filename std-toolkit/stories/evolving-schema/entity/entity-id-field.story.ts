import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
  email: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();

export const entityIdField = Story.make({
  title: 'What makes an entity more than a struct?',
  description:
    'A declared identity: the id field is auto-added to every version and no evolution may touch it.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

Everything from the struct stories, plus one need: rows that are **referenced
by id** — by the storage layer, by sync, by other entities.

## Answer

\`EntityESchema.make('User', 'id', fields)\` is a struct schema with a declared
identity. The builder reserves the \`id\` field:

- it is automatically added as \`Schema.String\` to **every** version — you
  never list it in \`make\` or in any delta;
- no evolution can remove, retype, or shadow it (\`{ id: … }\` in a delta is a
  compile error).

That guarantee is what makes migration safe *for storage*: however far a row
travels through the migration chain, the key it is stored and referenced under
is untouched.

\`\`\`ts
const user = yield* User.decode({ _v: 'v1', id: 'u1', name: 'Alice', email: 'a@b.com' });
// { id: 'u1', name: 'Alice', email: 'a@b.com', age: 0 }
\`\`\`

Everything else — evolutions, decode-time migration, encode stamping — behaves
exactly as in the struct stories.
`,
  run: Effect.gen(function* () {
    const user = yield* Story.trace(
      'decode a v1 user row with the latest schema',
      Effect.gen(function* () {
        yield* Effect.log(
          'Found a stored v1 row: it predates the age field entirely',
        );
        const decoded = yield* User.decode({
          _v: 'v1',
          id: 'u1',
          name: 'Alice',
          email: 'a@b.com',
        });
        yield* Effect.log(
          'Decode walked the v1→v2 evolve step and backfilled age to 0',
        );
        return decoded;
      }).pipe(
        Effect.withSpan('decode-v1-user', {
          attributes: {
            narrative: 'Read an old v1 user row with the latest User schema',
          },
        }),
      ),
    );
    yield* Story.assert(
      'identity survives migration untouched',
      user.id === 'u1',
    );
    yield* Story.assert('the migration backfills age', user.age === 0);
    yield* Story.assert(
      'the decoded value carries no version stamp',
      !('_v' in user),
    );

    const encoded = yield* Story.exec(
      'encode the migrated user back',
      User.encode(user),
    );
    yield* Story.assert(
      'the stored row keeps the same identity at the new version',
      encoded.id === 'u1' && encoded._v === 'v2',
    );
  }),
});
