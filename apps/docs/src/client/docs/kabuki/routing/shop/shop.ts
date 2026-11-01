import { Schema } from 'effect';
import { Page, Router } from '@kestack/kabuki/routing';

export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  price: Schema.Number,
});

// One product, at /products/2. Its data is loaded for each visit, and a
// copy stays fresh for 10 seconds.
export const Product = Page.define({
  path: '/:id',
  params: { id: Schema.FiniteFromString },
  data: Item,
  render: 'dynamic',
  staleTime: 10_000,
  metadata: ({ id }, item) => ({ title: item?.name ?? `Product ${id}` }),
  message: { Bought: {} },
});

export const ProductLive = Product.build({
  on: {
    // Buying moves the app. The order is done, so Back skips this page.
    Bought: () => ({ command: Router.replace(router.Thanks()) }),
  },
});

// The list at /products, with the product it opens drawn beside it.
export const Products = Page.define({
  path: '/products',
  data: Schema.Struct({ items: Schema.Array(Item) }),
  metadata: { title: 'Products' },
  pages: { Product },
});

export const ProductsLive = Products.build({
  pages: { Product: ProductLive },
});

export const Thanks = Page.define({
  path: '/thanks',
  metadata: { title: 'Thank you' },
});

export const ThanksLive = Thanks.build();

// The root page: no path, no data, every page under it.
export const Shop = Page.define({
  metadata: { title: 'Shop' },
  pages: { Products, Thanks },
});

export const ShopLive = Shop.build({
  pages: { Products: ProductsLive, Thanks: ThanksLive },
});

// The router, read down from the root.
export const router = Router.define(Shop, {
  redirect: { '/': (r) => r.Products() },
  notFound: { title: 'Not found' },
});

export type Route = typeof router.route.Type;
