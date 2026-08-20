import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Ticket = ESchema.make('Ticket', {
  subject: Schema.String,
})
  .evolve('v2', { fingerprint: Schema.String }, (previous) => ({
    ...previous,
    fingerprint: `${previous.subject.length}:${previous.subject.slice(0, 3).toLowerCase()}`,
  }))
  .build();

export const pureMigrations = Story.make({
  title: 'Pure migrations',
  description: 'The same bytes must decode to the same value on each read.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when the same stored row is decoded two times?',
      {
        answer:
          'Both reads produce the same value. This is true on each read, on each replica, and on each day.',
        proof: Effect.gen(function* () {
          const row = { _v: 'v1', subject: 'Printer on fire' };
          const first = yield* Ticket.decode(row);
          const second = yield* Ticket.decode(row);
          yield* Story.assert(
            'two reads of the same bytes agree exactly',
            first.fingerprint === second.fingerprint,
          );
          return { first, second };
        }),
      },
    ),
    Story.question('Where does the new value come from?', {
      answer:
        'From the previous value only. The migration does not use the clock, a random number, or data from outside.',
      proof: Effect.gen(function* () {
        const decoded = yield* Ticket.decode({
          _v: 'v1',
          subject: 'Printer on fire',
        });
        yield* Story.assert(
          'the derived value comes only from the row',
          decoded.fingerprint === '15:pri',
        );
        return decoded;
      }),
    }),
  ],
});
