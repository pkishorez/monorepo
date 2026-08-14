import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
  email: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({ ...previous, age: 0 }))
  .build();

export const eschemaEvolution = Story.make({
  title: 'ESchema evolves an entity across versions',
  description: 'Old rows stay readable as the schema grows.',
  markdown: `
An \`EntityESchema\` declares versioned shapes. Decoding a v1 payload
migrates it forward through every \`evolve\` step, so old rows stay
readable after the schema grows an \`age\` field.
  `,
  run: Effect.gen(function* () {
    const user = yield* Story.trace(
      'decode a v1 payload with the latest schema',
      User.decode({ _v: 'v1', id: 'u1', name: 'Alice', email: 'a@b.com' }).pipe(
        Effect.withSpan('decode-v1-user'),
      ),
    );
    yield* Story.assert('the v1 row is migrated to v2', '_v' in user === false);
    yield* Story.assert('the migration backfills age', user.age === 0);
    yield* Story.assert('identity survives migration', user.id === 'u1');
  }),
});
