import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Basket } from './basket.ts';

// An errand: ask whoever provides the Basket to add this product.
const add = Command.make('add', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const basket = yield* Basket;
      yield* basket.add(id);
    }),
});

export const Product = Actor.define('Product', {
  requires: [Basket],
  input: Schema.Struct({ id: Schema.String }),
  // How many are in the cart now. The Shop says; the Product only reads it.
  props: Schema.Struct({ inCart: Schema.Number }),
  model: Schema.Struct({ id: Schema.String }),
  message: Schema.TaggedUnion({ Added: {} }),
});

export const ProductLive = Actor.build(Product, {
  init: (product) => ({ model: product }),
  on: {
    Added: (_, { model }) => ({ command: add({ id: model.id }) }),
  },
});
