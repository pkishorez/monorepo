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
  title: 'Entity id field',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to the declared `id` field when a v1 row is decoded with the latest schema?',
      {
        answer:
          'The id is auto-added to every version and no evolution may touch it, so identity survives the migration chain untouched while `age` is backfilled.',
        proof: Effect.gen(function* () {
          const user = yield* User.decode({
            _v: 'v1',
            id: 'u1',
            name: 'Alice',
            email: 'a@b.com',
          });
          yield* Story.assert(
            'identity survives migration untouched',
            user.id === 'u1',
          );
          yield* Story.assert('the migration backfills age', user.age === 0);
          yield* Story.assert(
            'the decoded value carries no version stamp',
            !('_v' in user),
          );
          return user;
        }),
      },
    ),
    Story.question(
      'What does encoding the migrated user write back to storage?',
      {
        answer:
          'A row stamped at the latest version that keeps the same identity key it is stored and referenced under.',
        proof: Effect.gen(function* () {
          const user = yield* User.decode({
            _v: 'v1',
            id: 'u1',
            name: 'Alice',
            email: 'a@b.com',
          });
          const encoded = yield* User.encode(user);
          yield* Story.assert(
            'the stored row keeps the same identity at the new version',
            encoded.id === 'u1' && encoded._v === 'v2',
          );
          return encoded;
        }),
      },
    ),
  ],
});
