import { Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Basket } from './basket.ts';
import { CartLive } from './cart.ts';
import { ProductLive } from './product.ts';
import { PRODUCTS, countOf, totalOf } from './products.ts';

const Line = Schema.Struct({ id: Schema.String, quantity: Schema.Number });

export const Shop = Actor.define('Shop', {
  // Shopping, or looking at the order just placed.
  state: Schema.TaggedUnion({
    Shopping: {},
    Placed: { items: Schema.Number, total: Schema.Number },
  }),
  // The order is kept here, once, and handed down.
  model: Schema.Struct({ lines: Schema.Array(Line) }),
  message: Schema.TaggedUnion({
    Added: { id: Schema.String },
    Changed: { id: Schema.String, by: Schema.Number },
    CheckedOut: {},
    Restarted: {},
  }),
});

export const ShopLive = Actor.build(Shop, {
  init: () => ({ state: { _tag: 'Shopping' }, model: { lines: [] } }),
  // Everything below can change the order. Each change is a Message to here.
  provides: (self) =>
    Layer.succeed(Basket, {
      add: (id) => self.send({ _tag: 'Added', id }),
      change: (id, by) => self.send({ _tag: 'Changed', id, by }),
      checkout: () => self.send({ _tag: 'CheckedOut' }),
    }),
  states: {
    Shopping: {
      children: (child) => ({
        products: child(ProductLive, {
          each: () => Object.keys(PRODUCTS),
          input: (_, id) => ({ id }),
          props: ({ model }, id) => ({
            inCart: model.lines.find((line) => line.id === id)?.quantity ?? 0,
          }),
        }),
        cart: child(CartLive, {
          props: ({ model }) => ({ lines: model.lines }),
        }),
      }),
      on: {
        Added: ({ id }, { model }) => ({
          model: {
            lines: model.lines.some((line) => line.id === id)
              ? model.lines.map((line) =>
                  line.id === id
                    ? { ...line, quantity: line.quantity + 1 }
                    : line,
                )
              : [...model.lines, { id, quantity: 1 }],
          },
        }),
        // One less of the last one takes the line out.
        Changed: ({ id, by }, { model }) => ({
          model: {
            lines: model.lines
              .map((line) =>
                line.id === id
                  ? { ...line, quantity: line.quantity + by }
                  : line,
              )
              .filter((line) => line.quantity > 0),
          },
        }),
        CheckedOut: (_, { model }) =>
          model.lines.length === 0
            ? {}
            : {
                state: {
                  _tag: 'Placed',
                  items: countOf(model.lines),
                  total: totalOf(model.lines),
                },
                model: { lines: [] },
              },
      },
    },
    Placed: {
      on: { Restarted: () => ({ state: { _tag: 'Shopping' } }) },
    },
  },
});
