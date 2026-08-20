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
    'Absence is an explicit null. A key that is absent is an error, not a silent `undefined`.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does a field that can hold null decode when the value is there?',
      {
        answer: 'It decodes without a change.',
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
    Story.question('How does the schema say that a value is absent?', {
      answer: 'With an explicit `null`. It never uses an absent key.',
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
    Story.question('What happens when the key is absent?', {
      answer:
        'The decode fails. The system reports an error. It does not supply a silent `undefined`.',
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
