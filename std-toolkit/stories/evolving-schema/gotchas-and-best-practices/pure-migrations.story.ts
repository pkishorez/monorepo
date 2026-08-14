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
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens when the same stored row is decoded twice?', {
      answer:
        'A pure migration makes both reads agree exactly — the same bytes decode to the same value on every read, replica, and day.',
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
    }),
    Story.question('Where does the backfilled value come from?', {
      answer:
        'Only from the previous value itself — `fingerprint` is derived deterministically from `subject`, never from clocks, randomness, or IO.',
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
