import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.make({
  title: 'A resource lives until Verification ends',
  description:
    'The Preparation acquires a scoped resource the Verification still reads.',
  prepare: Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      Effect.succeed({ open: true }),
      (resource) =>
        Effect.sync(() => {
          resource.open = false;
        }),
    );
    yield* Proof.assert('the resource opened', resource.open);
    return resource;
  }),
  act: (resource) =>
    Effect.succeed({ doubled: 21 * 2, open: resource.open }).pipe(
      Effect.withSpan('double'),
    ),
  verify: (output, resource) =>
    Effect.gen(function* () {
      yield* Proof.assert('21 doubled is 42', output.doubled === 42);
      yield* Proof.assert('the resource is still open', resource.open);
    }),
});
