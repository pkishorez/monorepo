import { Effect } from 'effect';
import { Proof } from '../../../../../../story/index.js';

export default Proof.make({
  title: 'The answer never changes',
  critical: true,
  prepare: Effect.succeed(40),
  act: (value) => Effect.succeed(value + 2),
  verify: (output) => Proof.assert('the answer is 42', output === 42),
});
