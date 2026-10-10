import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.make({
  title: 'A dying Action errors',
  prepare: Effect.succeed('ready'),
  act: () => Effect.fail(new Error('the write was refused')),
  verify: () => Effect.void,
});
