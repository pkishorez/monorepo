import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Contact = ESchema.make('Contact', {
  name: Schema.String,
  phone: Schema.NullOr(Schema.String),
}).build();

export const noOptionalFields = Story.make({
  title: 'No optional fields',
  description:
    'Absence is an explicit null, and a missing key is an error rather than a silent undefined.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does a `NullOr` field decode when the value is present?',
      {
        answer: 'It decodes as-is.',
        proof: Effect.gen(function* () {
          const withPhone = yield* Contact.decode({
            _v: 'v1',
            name: 'Ada',
            phone: '+44 20 7946 0958',
          });
          yield* Story.assert(
            'a present value decodes as-is',
            withPhone.phone !== null,
          );
          return withPhone;
        }),
      },
    ),
    Story.question('How is absence expressed?', {
      answer: 'As an explicit `null`, never a missing key.',
      proof: Effect.gen(function* () {
        const withoutPhone = yield* Contact.decode({
          _v: 'v1',
          name: 'Grace',
          phone: null,
        });
        yield* Story.assert(
          'absence is an explicit null, not a missing key',
          withoutPhone.phone === null,
        );
        return withoutPhone;
      }),
    }),
    Story.question('What happens when the key is simply missing?', {
      answer:
        'Decode fails — a missing key is an error, never a silent `undefined`.',
      proof: Effect.gen(function* () {
        const missingKey = yield* Effect.flip(
          Contact.decode({ _v: 'v1', name: 'Edsger' }),
        );
        yield* Story.assert(
          'a missing key is a decode error, never a silent undefined',
          missingKey.message === 'Decode failed',
        );
        return missingKey;
      }),
    }),
  ],
});
