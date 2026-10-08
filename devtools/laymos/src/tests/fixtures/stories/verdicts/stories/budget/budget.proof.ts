import { Effect } from 'effect';
import { Proof } from '../../../../../../story/index.js';

export default Proof.make({
  title: 'A budget reads the trace',
  prepare: Effect.succeed('ready'),
  act: () =>
    Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan('fast'));
      yield* Effect.sleep('30 millis').pipe(Effect.withSpan('slow'));
    }),
  verify: () =>
    Effect.gen(function* () {
      yield* Proof.budget('fast', '1 second');
      yield* Proof.budget('slow', '5 millis');
      yield* Proof.budget('missing', '1 second');
    }),
});
