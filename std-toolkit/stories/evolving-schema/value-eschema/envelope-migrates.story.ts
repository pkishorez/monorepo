import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema, ESchemaError } from 'std-toolkit/eschema';

const Status = ValueESchema.make('Status', Schema.String)
  .evolve('v2', Schema.Literals(['open', 'closed']), (previous) =>
    previous === 'done' ? 'closed' : 'open',
  )
  .build();

export const envelopeMigrates = Story.make({
  title: 'Envelope migrates',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a v1 envelope is decoded after v2 tightened the type to literals?',
      {
        answer:
          "Decode dispatches on the envelope's `_v`, decodes with v1's codec, then migrates — mapping `'done'` onto the new `'closed'` literal.",
        proof: Effect.gen(function* () {
          const migrated = yield* Status.decode({ _v: 'v1', value: 'done' });
          yield* Story.assert(
            'the old value was mapped into the new literal set',
            migrated === 'closed',
          );
          return migrated;
        }),
      },
    ),
    Story.question('What happens when a doubly-wrapped envelope is decoded?', {
      answer:
        'The unwrap happens once — the inner envelope is handed to the codec and fails with `Decode failed`, so envelopes are never a value you nest yourself.',
      proof: Effect.gen(function* () {
        const error = yield* Effect.flip(
          Status.decode({ _v: 'v1', value: { _v: 'v1', value: 'done' } }),
        );
        yield* Story.assert(
          'only one layer unwraps — nesting envelopes fails',
          error instanceof ESchemaError && error.message === 'Decode failed',
        );
        return error;
      }),
    }),
  ],
});
