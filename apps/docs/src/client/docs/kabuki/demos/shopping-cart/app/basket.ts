import { Context } from 'effect';
import type { Effect } from 'effect';

// What the Shop offers everything below it: ways to change the order.
export class Basket extends Context.Service<
  Basket,
  {
    readonly add: (id: string) => Effect.Effect<void>;
    readonly change: (id: string, by: number) => Effect.Effect<void>;
    readonly checkout: () => Effect.Effect<void>;
  }
>()('demo/Basket') {}
