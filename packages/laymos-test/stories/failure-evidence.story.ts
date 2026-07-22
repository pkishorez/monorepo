import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { step, story } from 'laymos/story';

story('Failure evidence', {
  description:
    'Explains which narrated execution remains visible when verification fails after the shared Story execution completes.',
})
  .execute(() =>
    step(
      'Visit before assertion',
      {
        description:
          'Reads the environment-controlled failure signal before the Scenario verifies the observed value.',
      },
      Effect.sync(() => process.env['LAYMOS_TEST_FORCE_FAILURE']),
    ),
  )
  .scenario(
    'conditionally fails',
    {
      description:
        'Prepares an environment-controlled signal to demonstrate that completed execution visits survive a later verification failure.',
    },
    (scenario) =>
      scenario
        .prepare(() => Effect.void)
        .verify((forceFailure) =>
          Effect.sync(() => assert.notEqual(forceFailure, '1')),
        ),
  );
