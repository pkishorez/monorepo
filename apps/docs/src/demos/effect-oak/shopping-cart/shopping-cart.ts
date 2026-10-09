import { Context, Schema } from 'effect';
import { Node } from 'effect-oak';
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
 * and Requests to add to it and to empty it.
 */

const Page = Schema.Literals(['Products', 'Cart', 'Checkout']);

export const Shop = Node.make('Shop', {
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
    Products: ({ model, send }) => basket(model.cart, send),
    Checkout: ({ model, send }) => basket(model.cart, send),
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

const basket = (
  cart: Cart,
  send: (
    message:
      | { readonly _tag: 'RequestedAdd'; readonly item: Item }
      | { readonly _tag: 'RequestedClear' },
  ) => void,
) =>
  Context.make(Basket, {
    cart,
    add: (item) => send({ _tag: 'RequestedAdd', item }),
    clear: () => send({ _tag: 'RequestedClear' }),
  });

export { ShopServerLive } from './shop-server/index.js';
