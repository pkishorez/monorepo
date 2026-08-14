import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Session = ESchema.make('Session', {
  token: Schema.String,
})
  .evolve('v2', { device: Schema.String }, (previous) => ({
    ...previous,
    device: 'unknown',
  }))
  .build();

export const encodeWritesLatest = Story.make({
  title: 'Encode writes latest',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What version does encode stamp on a new row?', {
      answer:
        'Always the latest — encode validates against the newest schema and writes `_v: "v2"`.',
      proof: Effect.gen(function* () {
        const stored = yield* Session.encode({ token: 'abc', device: 'mac' });
        yield* Story.assert(
          'the row is stamped with the latest version',
          stored._v === 'v2',
        );
        return stored;
      }),
    }),
    Story.question('What happens to extra properties on the value?', {
      answer:
        'They are silently dropped — the stored row contains exactly the declared shape.',
      proof: Effect.gen(function* () {
        const stored = yield* Session.encode({
          token: 'abc',
          device: 'mac',
          debugFlag: true,
        } as never);
        yield* Story.assert(
          'the extra property was silently dropped',
          !('debugFlag' in stored),
        );
        return stored;
      }),
    }),
    Story.question('What happens when a declared field is missing?', {
      answer: 'Encode fails loudly with `Encode failed`.',
      proof: Effect.gen(function* () {
        const error = yield* Effect.flip(
          Session.encode({ token: 'abc' } as never),
        );
        yield* Story.assert(
          'a missing field fails loudly',
          error.message === 'Encode failed',
        );
        return error;
      }),
    }),
  ],
});
