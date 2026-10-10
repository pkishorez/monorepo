import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.make({
  title: 'A false Verification fails',
  prepare: Effect.succeed(1),
  act: (value) => Effect.succeed(value + 1),
  verify: (output) => Proof.assert('one plus one is three', output === 3),
});
