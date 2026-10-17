import { Context, Effect, Layer } from 'effect';

// A live price, from somewhere outside the app.
export class PriceFeed extends Context.Service<
  PriceFeed,
  { readonly next: Effect.Effect<number> }
>()('demo/PriceFeed') {}

// Opens the feed when built, and closes it when its Scope closes.
// `log` tells the app each time it does.
export const priceFeed = (log: (line: string) => Effect.Effect<void>) =>
  Layer.effect(
    PriceFeed,
    Effect.acquireRelease(
      log('Feed opened').pipe(
        Effect.map(() => {
          let price = 100;
          return {
            next: Effect.sync(() => {
              price = Math.max(1, price + (Math.random() - 0.5) * 1.2);
              return Math.round(price * 100) / 100;
            }),
          };
        }),
      ),
      () => log('Feed closed'),
    ),
  );
