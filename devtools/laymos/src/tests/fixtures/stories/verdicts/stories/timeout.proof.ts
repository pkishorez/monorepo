import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.make({
  title: 'A hanging Action times out',
  timeout: '200 millis',
  prepare: Effect.succeed('ready'),
  act: () => Effect.never,
  verify: () => Effect.void,
});
