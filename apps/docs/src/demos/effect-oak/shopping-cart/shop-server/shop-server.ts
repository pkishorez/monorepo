import { Context, Effect, Layer } from 'effect';
import type { Cart, Item } from '../basket/index.js';

/*
 * The fake backend: a product catalog and an order desk, both slow on
 * purpose and both in the browser.
 */

const DELAY_MS = 600;

const PRODUCTS: ReadonlyArray<Item> = [
  { id: '1', name: 'Apple', price: 1.5 },
  { id: '2', name: 'Banana', price: 0.75 },
  { id: '3', name: 'Orange', price: 2.0 },
  { id: '4', name: 'Bread', price: 3.25 },
  { id: '5', name: 'Milk', price: 4.0 },
  { id: '6', name: 'Eggs', price: 5.5 },
];

export class ShopServer extends Context.Service<
  ShopServer,
  {
    readonly products: Effect.Effect<ReadonlyArray<Item>>;
    /** Places an order and answers with its id; an empty cart is refused. */
    readonly placeOrder: (
      cart: Cart,
      instructions: string,
    ) => Effect.Effect<string, string>;
  }
>()('docs/shopping-cart/ShopServer') {}

export const ShopServerLive = Layer.sync(ShopServer, () => {
  let orders = 0;
  return {
    products: Effect.sleep(DELAY_MS).pipe(Effect.as(PRODUCTS)),
    placeOrder: (cart) =>
      Effect.sleep(DELAY_MS).pipe(
        Effect.andThen(
          cart.length === 0
            ? Effect.fail('Your cart is empty')
            : Effect.sync(() => `ORD-${1001 + orders++}`),
        ),
      ),
  };
});
