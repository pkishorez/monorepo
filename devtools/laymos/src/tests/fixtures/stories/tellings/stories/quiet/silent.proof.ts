import { Effect } from 'effect';
import { Proof } from '../../../../../../story/index.js';

export default Proof.make({
  title: 'A Proof in a Story with no Telling',
  prepare: Effect.succeed(1),
  act: (value) => Effect.succeed(value),
  verify: (value) => Proof.assert('it is one', value === 1),
});
