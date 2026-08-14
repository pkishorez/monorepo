import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Account = ESchema.make('Account', {
  email: Schema.String,
  fax: Schema.String,
})
  .evolve('v2', { fax: null }, ({ fax: _fax, ...rest }) => rest)
  .build();

export const removeAField = Story.make({
  title: 'Remove a field',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to a v1 row that still stores the removed `fax`?',
      {
        answer:
          'The migration drops the field on decode, so code at the latest shape never sees it.',
        proof: Effect.gen(function* () {
          const migrated = yield* Account.decode({
            _v: 'v1',
            email: 'ada@lovelace.dev',
            fax: '+1-555-0100',
          });
          yield* Story.assert(
            'the removed field is gone after decode',
            !('fax' in migrated),
          );
          yield* Story.assert(
            'the surviving field is intact',
            migrated.email === 'ada@lovelace.dev',
          );
          return migrated;
        }),
      },
    ),
    Story.question('What gets written when a migrated row is encoded back?', {
      answer: 'It is stamped `v2` and no longer carries the field.',
      proof: Effect.gen(function* () {
        const migrated = yield* Account.decode({
          _v: 'v1',
          email: 'ada@lovelace.dev',
          fax: '+1-555-0100',
        });
        const encoded = yield* Account.encode(migrated);
        yield* Story.assert(
          're-encoded rows are stamped v2',
          encoded._v === 'v2',
        );
        yield* Story.assert(
          're-encoded rows no longer carry the field',
          !('fax' in encoded),
        );
        return encoded;
      }),
    }),
  ],
});
