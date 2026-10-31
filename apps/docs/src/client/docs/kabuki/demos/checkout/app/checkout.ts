import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const FORMATS = ['Paperback', 'Ebook'] as const;
export type Format = (typeof FORMATS)[number];

// What the book costs in each format, and what shipping adds.
export const PRICE = { Paperback: 24, Ebook: 12 };
export const SHIPPING = 5;
const PROMO = 'SAVE10';

// The order, kept across every step.
const Order = Schema.Struct({
  format: Schema.Literals(FORMATS),
  address: Schema.String,
  card: Schema.String,
  promo: Schema.NullOr(Schema.String),
});

export const Checkout = Actor.define('Checkout', {
  // The steps of a checkout. It is always on exactly one.
  state: Schema.TaggedUnion({
    Cart: {},
    Shipping: {},
    Payment: {},
    // The last promo code it turned down, shown only here.
    Review: { rejected: Schema.NullOr(Schema.String) },
    Placing: {},
    Placed: { order: Schema.String },
  }),
  model: Order,
  message: Schema.TaggedUnion({
    FormatChosen: { format: Schema.Literals(FORMATS) },
    AddressGiven: { address: Schema.String },
    CardGiven: { card: Schema.String },
    PromoTried: { code: Schema.String },
    OrderPlaced: {},
    OrderConfirmed: {},
    WentBack: {},
    StartedOver: {},
  }),
});

const start = {
  state: { _tag: 'Cart' },
  model: { format: 'Paperback', address: '', card: '', promo: null },
} as const;

export const CheckoutLive = Actor.build(Checkout, {
  init: () => start,
  states: {
    // Each step takes only the Messages that make sense on it.
    Cart: {
      on: {
        // An e-book has nothing to ship, so it skips Shipping.
        FormatChosen: ({ format }, { model }) => ({
          state: { _tag: format === 'Ebook' ? 'Payment' : 'Shipping' },
          model: { ...model, format },
        }),
      },
    },
    Shipping: {
      on: {
        AddressGiven: ({ address }, { model }) => ({
          state: { _tag: 'Payment' },
          model: { ...model, address },
        }),
        WentBack: () => ({ state: { _tag: 'Cart' } }),
      },
    },
    Payment: {
      on: {
        CardGiven: ({ card }, { model }) => ({
          state: { _tag: 'Review', rejected: null },
          model: { ...model, card },
        }),
        WentBack: (_, { model }) => ({
          state: { _tag: model.format === 'Ebook' ? 'Cart' : 'Shipping' },
        }),
      },
    },
    Review: {
      on: {
        PromoTried: ({ code }, { model }) =>
          code.trim().toUpperCase() === PROMO
            ? {
                state: { _tag: 'Review', rejected: null },
                model: { ...model, promo: PROMO },
              }
            : { state: { _tag: 'Review', rejected: code.trim() } },
        OrderPlaced: () => ({ state: { _tag: 'Placing' } }),
        WentBack: () => ({ state: { _tag: 'Payment' } }),
      },
    },
    Placing: {
      // A pretend payment: it runs while the order is Placing, and stops if
      // the checkout leaves it.
      workers: {
        pay: {
          run: (self) =>
            Effect.sleep('1500 millis').pipe(
              Effect.andThen(self.send({ _tag: 'OrderConfirmed' })),
            ),
        },
      },
      on: {
        // The order number comes from the Message's Time, so a replay gets
        // the same one.
        OrderConfirmed: (_, { at }) => ({
          state: {
            _tag: 'Placed',
            order: `KB-${1000 + (Math.round(at) % 9000)}`,
          },
        }),
      },
    },
    Placed: {
      on: { StartedOver: () => start },
    },
  },
});

// What the order costs, line by line.
export const priceOf = ({ format, promo }: typeof Order.Type) => {
  const item = PRICE[format];
  const shipping = format === 'Paperback' ? SHIPPING : 0;
  const discount = promo ? (item + shipping) * 0.1 : 0;
  return { item, shipping, discount, total: item + shipping - discount };
};
