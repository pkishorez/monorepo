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
  title: 'Total migrations',
  description:
    'A migration has to answer for every value the old version allowed.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens to a v1 row with a real nickname?', {
      answer: 'The migration carries it straight over to `displayName`.',
      proof: Effect.gen(function* () {
        const named = yield* Profile.decode({ _v: 'v1', nickname: 'ada' });
        yield* Story.assert(
          'a real nickname carries over',
          named.displayName === 'ada',
        );
        return named;
      }),
    }),
    Story.question(
      'What happens to the `null` nickname the v1 schema always allowed?',
      {
        answer:
          'The migration must map it to a valid value — here `anonymous` — because it runs on every row of its era.',
        proof: Effect.gen(function* () {
          const nullCase = yield* Profile.decode({ _v: 'v1', nickname: null });
          yield* Story.assert(
            'null maps to a valid fallback',
            nullCase.displayName === 'anonymous',
          );
          return nullCase;
        }),
      },
    ),
    Story.question(
      'What happens to the empty-string nickname nobody remembers writing?',
      {
        answer:
          'A total migration covers even the forgotten case, mapping whitespace to `anonymous` instead of failing on read months later.',
        proof: Effect.gen(function* () {
          const emptyCase = yield* Profile.decode({
            _v: 'v1',
            nickname: '   ',
          });
          yield* Story.assert(
            'even the forgotten case maps somewhere sensible',
            emptyCase.displayName === 'anonymous',
          );
          return emptyCase;
        }),
      },
    ),
  ],
});
