import { Effect, Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import type { Self } from 'effect-oak';
import {
  addItem,
  Basket,
  Cart,
  changeQuantity,
  Item,
  removeItem,
} from './basket/index.js';
import { Checkout } from './checkout/index.js';
import { Products } from './products/index.js';
import { ShopServer } from './shop-server/index.js';

/*
 * A shop with three pages and no router: each page is a State of the shop.
 * The cart is the Model, kept on every page. Products and Checkout are
 * Children of their page's State, so leaving a page destroys it: the search
 * is forgotten and the catalog is fetched again. The Cart page is a drawing
 * of the Model and sends the shop's own Messages.
 *
 * On the pages with Children the shop Provides Basket: the cart as it is,
 * read when asked, and Requests to add to it and to empty it.
 */

const Page = Schema.Literals(['Products', 'Cart', 'Checkout']);

const basket = (
  self: Self<
    { readonly cart: Cart },
    unknown,
    | { readonly _tag: 'RequestedAdd'; readonly item: Item }
    | { readonly _tag: 'RequestedClear' }
  >,
) =>
  Layer.succeed(Basket, {
    cart: self.get.pipe(Effect.map(({ model }) => model.cart)),
    add: (item) => self.send({ _tag: 'RequestedAdd', item }),
    clear: () => self.send({ _tag: 'RequestedClear' }),
  });

export const Shop = Actor.make('Shop', {
  requires: { shop: ShopServer },
  model: Schema.Struct({ cart: Cart }),
  state: Schema.TaggedUnion({ Products: {}, Cart: {}, Checkout: {} }),
  message: Schema.TaggedUnion({
    ClickedPage: { page: Page },
    RequestedAdd: { item: Item },
    RequestedClear: {},
    ClickedIncrement: { itemId: Schema.String },
    ClickedDecrement: { itemId: Schema.String },
    ClickedRemove: { itemId: Schema.String },
    ClickedClear: {},
  }),
  provides: { Products: [Basket], Checkout: [Basket] },
  children: {
    Products: { products: Products },
    Checkout: { checkout: Checkout },
  },
}).build({
  init: () => ({ model: { cart: [] }, state: { _tag: 'Products' } }),
  provides: {
    Products: basket,
    Checkout: basket,
  },
  update: {
    '*': {
      ClickedPage: ({ page }) => ({ state: { _tag: page } }),
      RequestedAdd: ({ item }, { model }) => ({
        model: { cart: addItem(model.cart, item) },
      }),
      RequestedClear: () => ({ model: { cart: [] } }),
    },
    Cart: {
      ClickedIncrement: ({ itemId }, { model }) => ({
        model: { cart: changeQuantity(model.cart, itemId, 1) },
      }),
      ClickedDecrement: ({ itemId }, { model }) => ({
        model: { cart: changeQuantity(model.cart, itemId, -1) },
      }),
      ClickedRemove: ({ itemId }, { model }) => ({
        model: { cart: removeItem(model.cart, itemId) },
      }),
      ClickedClear: () => ({ model: { cart: [] } }),
    },
  },
});

export { ShopServerLive } from './shop-server/index.js';
