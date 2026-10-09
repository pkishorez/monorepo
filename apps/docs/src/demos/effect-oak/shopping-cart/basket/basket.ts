import { Context, Schema } from 'effect';

/*
 * The cart as data: its Schemas and what each change does to it. And Basket,
 * the Service the shop gives its pages so they can add to the cart, read it
 * and empty it without knowing where it is kept.
 */

export const Item = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  price: Schema.Number,
});
export type Item = typeof Item.Type;

export const Cart = Schema.Array(
  Schema.Struct({ item: Item, quantity: Schema.Number }),
);
export type Cart = typeof Cart.Type;

/** Provided by the shop: the cart as it is now, and Requests to change it. */
export class Basket extends Context.Service<
  Basket,
  {
    readonly cart: Cart;
    readonly add: (item: Item) => void;
    readonly clear: () => void;
  }
>()('docs/shopping-cart/Basket') {}

export const addItem = (cart: Cart, item: Item): Cart =>
  cart.some((line) => line.item.id === item.id)
    ? changeQuantity(cart, item.id, 1)
    : [...cart, { item, quantity: 1 }];

/** Add `by` to an item's quantity; at zero it leaves the cart. */
export const changeQuantity = (cart: Cart, itemId: string, by: number): Cart =>
  cart
    .map((line) =>
      line.item.id === itemId
        ? { ...line, quantity: line.quantity + by }
        : line,
    )
    .filter((line) => line.quantity > 0);

export const removeItem = (cart: Cart, itemId: string): Cart =>
  cart.filter((line) => line.item.id !== itemId);

export const totalItems = (cart: Cart) =>
  cart.reduce((total, line) => total + line.quantity, 0);

export const totalPrice = (cart: Cart) =>
  cart.reduce((total, line) => total + line.quantity * line.item.price, 0);

export const money = (amount: number) => `$${amount.toFixed(2)}`;
