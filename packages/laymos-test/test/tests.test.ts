import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';
import { laymosDescribe, laymosTest } from 'laymos/test';

import { authorizeAccess, checkout } from '../src/index.js';

describe('ordinary Vitest tests', () => {
  test('runs without Laymos authoring', async () => {
    const result = await Effect.runPromise(
      authorizeAccess({ actorId: 'actor-1', policy: 'allow' }),
    );

    expect(result).toBe('granted');
  });
});

laymosDescribe(
  'Checkout routing',
  {
    description: 'Shows the result produced by each checkout route.',
    documentation: `
## Routing contract

Checkout routes every order into exactly one terminal payment state:

- **approved** orders are charged immediately;
- **review** orders wait for a person;
- **rejected** orders stop before payment.

This suite documents the boundary between order review and payment execution.
`,
  },
  () => {
    laymosTest(
      'routes checkout decisions',
      {
        description:
          'Runs every checkout route and records the payment state produced for each one.',
        documentation: `
## Approved route

An approved risk decision must proceed directly to payment without entering
manual review. Review and rejected decisions must remain outside payment.
`,
      },
      ({ expect }) =>
        Effect.gen(function* () {
          const approved = yield* checkout({
            orderId: 'order-1',
            route: 'approved',
          });
          const review = yield* checkout({
            orderId: 'order-1',
            route: 'review',
          });
          const rejected = yield* checkout({
            orderId: 'order-1',
            route: 'rejected',
          });

          expect(approved, 'charges approved orders').toBe('charged');
          expect(review, 'queues uncertain orders').toBe('queued');
          expect(rejected, 'declines rejected orders').toBe('declined');
        }),
    );
  },
);

laymosTest(
  'captures an Effect trace',
  {
    description:
      'Runs the selected Effect normally while making its completed spans available to ordinary Vitest assertions.',
  },
  ({ expect, trace }) =>
    Effect.gen(function* () {
      const result = yield* trace(
        Effect.gen(function* () {
          yield* Effect.log('Starting checkout');
          return yield* Effect.gen(function* () {
            yield* Effect.log('Charging order').pipe(
              Effect.annotateLogs('orderId', 'order-2'),
            );
            return yield* checkout({
              orderId: 'order-2',
              route: 'approved',
            });
          }).pipe(
            Effect.withSpan('checkout', {
              attributes: { orderId: 'order-2' },
            }),
          );
        }),
      );

      expect(result, 'returns the Effect result').toBe('charged');
      expect(
        trace.getSpanCount({ name: 'checkout' }),
        'captures the checkout span',
      ).toBe(1);
      expect(
        trace.getSpans({ status: 'success' }).length,
        'records the successful span status',
      ).toBe(1);
    }),
);

laymosTest.each([
  ['approved', 'charged'],
  ['rejected', 'declined'],
] as const)(
  'reports the %s route',
  {
    description:
      'Confirms that parameterized Laymos Tests keep their row values while receiving the Laymos assertion context.',
  },
  (route, expected, { expect }) =>
    Effect.gen(function* () {
      const result = yield* checkout({ orderId: 'order-3', route });
      expect(result, `returns ${expected} for ${route}`).toBe(expected);
    }),
);
