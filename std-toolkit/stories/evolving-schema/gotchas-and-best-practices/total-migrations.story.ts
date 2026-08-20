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
    'A migration must accept each value that the old version allowed.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens to a v1 row that has a real nickname?', {
      answer: 'The migration copies it to the new field.',
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
      'What happens to the null nickname that the v1 schema allowed?',
      {
        answer:
          'The migration must map it to a valid value. It runs on each row of that version, so it cannot ignore the case.',
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
    Story.question('What happens to the empty nickname that nobody expected?', {
      answer:
        'A complete migration covers this case too. It maps the empty value to a valid one. If it does not, the read fails months later.',
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
    }),
  ],
});
