import { Effect } from 'effect';
import { decision, functionBlock, step } from 'laymos/story';

export interface CheckoutInput {
  readonly orderId: string;
  readonly route: 'approved' | 'review' | 'rejected';
}

export type CheckoutResult = 'charged' | 'queued' | 'declined';

const reserveInventory = functionBlock(
  'Reserve inventory',
  {
    description:
      'Reserves the requested stock so another checkout cannot claim it while this order is being processed.',
    attributes: (orderId: string) => ({ orderId }),
  },
  (_orderId: string) =>
    step(
      'Lock stock',
      {
        description:
          'Creates the inventory hold that keeps the order fulfillable while payment is authorized.',
      },
      Effect.sleep(1),
    ),
);

const authorizePayment = functionBlock(
  'Authorize payment',
  {
    description:
      'Confirms with the payment provider that the customer can fund the order before checkout chooses an outcome.',
  },
  () =>
    step(
      'Contact payment provider',
      {
        description:
          'Sends the authorization request to the **payment provider** and waits for the network response.\n\n- Validates the returned authorization details\n- Preserves context for checkout routing\n- Explains why the order can continue, pause for review, or stop without capturing funds',
      },
      Effect.sleep(1),
    ),
);

export const checkout = functionBlock(
  'Checkout order',
  {
    description:
      'Coordinates inventory reservation and payment authorization, then routes the order to its final checkout outcome.',
    attributes: (input: CheckoutInput) => ({
      orderId: input.orderId,
      route: input.route,
    }),
  },
  (input: CheckoutInput): Effect.Effect<CheckoutResult> =>
    step(
      'Prepare checkout',
      {
        description:
          'Runs the independent inventory and payment prerequisites concurrently before the order can be routed.',
      },
      Effect.gen(function* () {
        yield* Effect.all(
          [reserveInventory(input.orderId), authorizePayment()],
          { concurrency: 'unbounded' },
        );

        return yield* decision(
          'Route checkout',
          {
            description:
              'Chooses whether checkout captures payment, requests manual review, or declines the order from the prepared route.',
            attributes: (route) => ({ route }),
          },
          input.route,
        )
          .when(
            'approved',
            {
              name: 'Charge order',
              description:
                'The order passed its checks, so checkout may capture the authorized payment and complete automatically.',
            },
            () =>
              step(
                'Capture payment',
                {
                  description:
                    'Captures the previously authorized funds and records the order as charged.',
                },
                Effect.succeed('charged' as const),
              ),
          )
          .when(
            'review',
            {
              name: 'Review order',
              description:
                'Automated checks could not make a final decision with sufficient confidence. Checkout pauses `payment capture`, records the uncertain signals, and sends the order to a **human reviewer** with the full decision context.',
            },
            () =>
              step(
                'Queue manual review',
                {
                  description:
                    'Places the order in the operations queue and leaves payment uncaptured until a reviewer decides.',
                },
                Effect.succeed('queued' as const),
              ),
          )
          .otherwise(
            {
              name: 'Decline order',
              description:
                'Any route not handled as approval or review represents an order that checkout must decline.',
            },
            (route) =>
              step(
                'Record rejection',
                {
                  description:
                    'Records the rejected route so the order remains stopped and its terminal outcome is explainable.',
                  attributes: { route },
                },
                Effect.succeed('declined' as const),
              ),
          );
      }),
    ),
);
