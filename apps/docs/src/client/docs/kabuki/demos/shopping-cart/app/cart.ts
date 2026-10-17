import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Basket } from './basket.ts';

const Line = Schema.Struct({ id: Schema.String, quantity: Schema.Number });

// Errands for the Basket: one more or one less of a line, and pay.
const change = Command.make('change', {
  args: Schema.Struct({ id: Schema.String, by: Schema.Number }),
  run: ({ id, by }) =>
    Effect.gen(function* () {
      const basket = yield* Basket;
      yield* basket.change(id, by);
    }),
});

const checkout = Command.make('checkout', {
  args: Schema.Struct({}),
  run: () =>
    Effect.gen(function* () {
      const basket = yield* Basket;
      yield* basket.checkout();
    }),
});

// The Cart keeps nothing of its own. It draws the lines the Shop hands it,
// and asks the Basket for every change.
export const Cart = Actor.define('Cart', {
  requires: [Basket],
  props: Schema.Struct({ lines: Schema.Array(Line) }),
  message: Schema.TaggedUnion({
    Increased: { id: Schema.String },
    Decreased: { id: Schema.String },
    CheckedOut: {},
  }),
});

export const CartLive = Actor.build(Cart, {
  on: {
    Increased: ({ id }) => ({ command: change({ id, by: 1 }) }),
    Decreased: ({ id }) => ({ command: change({ id, by: -1 }) }),
    CheckedOut: () => ({ command: checkout({}) }),
  },
});
