import { Effect, Match } from 'effect';

export interface CheckoutInput {
  readonly orderId: string;
  readonly route: 'approved' | 'review' | 'rejected';
}

export type CheckoutResult = 'charged' | 'queued' | 'declined';

const reserveInventory = (_orderId: string) => Effect.sleep(1);

const authorizePayment = () => Effect.sleep(1);

const prepareCheckout = (input: CheckoutInput): Effect.Effect<CheckoutResult> =>
  Effect.gen(function* () {
    yield* Effect.all([reserveInventory(input.orderId), authorizePayment()], {
      concurrency: 'unbounded',
    });

    return yield* Match.value(input.route).pipe(
      Match.when('approved', () => Effect.succeed('charged' as const)),
      Match.when('review', () => Effect.succeed('queued' as const)),
      Match.when('rejected', () => Effect.succeed('declined' as const)),
      Match.exhaustive,
    );
  });

export const checkout = (input: CheckoutInput): Effect.Effect<CheckoutResult> =>
  prepareCheckout(input);
