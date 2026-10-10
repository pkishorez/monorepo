import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { Basket, Item, money } from '../basket/index.js';
import { ShopServer } from '../shop-server/index.js';

/*
 * The products page: Loading the catalog from the ShopServer in a Lifetime,
 * then Ready with a search. "Add to cart" is a Request through Basket, so the
 * page never holds the cart.
 *
 * Foldkit draws − n + on a product already in the cart, from the cart its
 * parent passes in as a view input. A Child here cannot be given the
 * parent's data, so every product shows "Add to cart" and the count is in
 * the shop's nav.
 */

export const Products = Actor.make('Products', {
  requires: { shop: ShopServer, basket: Basket },
  state: Schema.TaggedUnion({
    Loading: {},
    Ready: { products: Schema.Array(Item), search: Schema.String },
  }),
  message: Schema.TaggedUnion({
    Loaded: { products: Schema.Array(Item) },
    ChangedSearch: { value: Schema.String },
    ClickedAddToCart: { item: Item },
  }),
}).build({
  init: () => ({ state: { _tag: 'Loading' } }),
  lifetime: {
    Loading: (self) =>
      Effect.gen(function* () {
        const products = yield* (yield* ShopServer).products;
        yield* self.send({ _tag: 'Loaded', products });
      }),
  },
  update: {
    Loading: {
      Loaded: ({ products }) => ({
        state: { _tag: 'Ready', products, search: '' },
      }),
    },
    Ready: {
      ChangedSearch: ({ value }, { state }) => ({
        state: { ...state, search: value },
      }),
      ClickedAddToCart: ({ item }) => ({
        command: Effect.gen(function* () {
          yield* (yield* Basket).add(item);
        }),
      }),
    },
  },
});

export const ProductsView = View.make(Products, {
  Loading: () => (
    <div className="flex justify-center p-10">
      <Spinner />
    </div>
  ),
  Ready: ({ state, send }) => {
    const search = state.search.trim().toLowerCase();
    const shown = state.products.filter((product) =>
      product.name.toLowerCase().includes(search),
    );
    return (
      <div className="flex flex-col gap-4">
        <Input
          type="search"
          aria-label="Search products"
          placeholder="Search products…"
          value={state.search}
          onChange={(event) =>
            send({ _tag: 'ChangedSearch', value: event.target.value })
          }
        />
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No products match “{state.search}”.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {money(item.price)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => send({ _tag: 'ClickedAddToCart', item })}
                >
                  Add to cart
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
});
