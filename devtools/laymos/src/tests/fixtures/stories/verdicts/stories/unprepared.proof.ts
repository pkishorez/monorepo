import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.make({
  title: 'A false Preparation skips the rest',
  prepare: Effect.gen(function* () {
    yield* Proof.assert('the table exists', false);
    return 'table';
  }),
  act: () => Effect.die('the Action must not run'),
  verify: () => Effect.void,
});
