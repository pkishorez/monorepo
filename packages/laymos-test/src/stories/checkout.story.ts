import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { checkout, type CheckoutInput } from '../order-workflow.js';

story('Checkout routing', {
  description:
    'Explains how checkout reserves inventory, authorizes payment, and turns each prepared route into a terminal order outcome.',
})
  .execute((prepared: CheckoutInput) => checkout(prepared))
  .scenario(
    'approved order',
    {
      description:
        'Prepares an approved order to show the route that captures payment after all prerequisites succeed.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            orderId: 'order-approved',
            route: 'approved' as const,
          }),
        )
        .verify((result) => Effect.sync(() => assert.equal(result, 'charged'))),
  )
  .scenario(
    'manual review',
    {
      description:
        'Prepares an uncertain order to show why checkout pauses automation and queues a human review.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({ orderId: 'order-review', route: 'review' as const }),
        )
        .verify((result) => Effect.sync(() => assert.equal(result, 'queued'))),
  )
  .scenario(
    'rejected order',
    {
      description:
        'Prepares a rejected order to show how checkout records a decline without capturing payment.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            orderId: 'order-rejected',
            route: 'rejected' as const,
          }),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result, 'declined')),
        ),
  )
  .skip('provider unavailable', {
    description:
      'Reserves a future Scenario for explaining how checkout behaves when its payment provider cannot respond.',
  });
