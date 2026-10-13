import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.make({
  title: 'A Proof that leaves a timer running',
  prepare: Effect.sync(() => setInterval(() => {}, 1000)),
  act: () => Effect.succeed(1),
  verify: (value) => Proof.assert('it is one', value === 1),
});
