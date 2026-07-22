import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { authorizeAccess } from '../src/access-workflow.js';

type AccessScenario = {
  readonly actorId: string;
  readonly policy: 'allow' | 'challenge' | 'deny';
};

story('Access control', {
  description:
    'Explains how an authenticated actor policy becomes immediate access, additional verification, or a blocked request.',
})
  .execute((prepared: AccessScenario) => authorizeAccess(prepared))
  .scenario(
    'allowed actor',
    {
      description:
        'Prepares an allow policy to show the direct route from policy evaluation to an authenticated session.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            actorId: 'actor-allow',
            policy: 'allow' as const,
          }),
        )
        .verify((result) => Effect.sync(() => assert.equal(result, 'granted'))),
  )
  .scenario(
    'challenged actor',
    {
      description:
        'Prepares a challenge policy to show how access pauses until the actor supplies stronger identity evidence.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            actorId: 'actor-challenge',
            policy: 'challenge' as const,
          }),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result, 'verification-required')),
        ),
  )
  .scenario(
    'denied actor',
    {
      description:
        'Prepares a deny policy to show how authorization terminates without creating an authenticated session.',
      timeout: '10 seconds',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            actorId: 'actor-deny',
            policy: 'deny' as const,
          }),
        )
        .verify((result) => Effect.sync(() => assert.equal(result, 'blocked'))),
  );
