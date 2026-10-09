import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { Discount, discountFor, PromoCode, Promos } from './promo/index.js';

/*
 * A book checkout as one Node's States:
 *
 *   Cart → (Shipping, for a hardcover) → Payment → Review → Placing → Confirmed
 *
 * and Cancelled from any step before Placing. The edition is the Model: it is
 * kept in every State. What a step collects (a payment method, accepted
 * terms, a promo) is that State's data, so going back to Payment forgets the
 * terms, as Foldkit's machine does.
 *
 * Foldkit's `Machine.forStates([...]).on(...)` is an object spread here: the
 * same rules written into the update of each State that has them.
 */

const PLACE_ORDER_DELAY_MS = 1000;

const Promo = Schema.TaggedUnion({
  NoPromo: {},
  AppliedPromo: { discount: Discount },
  RejectedPromo: { code: Schema.String },
});

const MaybeDiscount = Schema.NullOr(Discount);

/** Pretend to place the order, in the app's Time. */
const placeOrder = (shipping: boolean) =>
  Effect.sleep(PLACE_ORDER_DELAY_MS).pipe(
    Effect.as({
      _tag: 'SucceededPlaceOrder' as const,
      orderId: shipping ? 'SHIP-1001' : 'DIGI-1001',
    }),
  );

const cancellable = {
  ClickedCancel: () => ({ state: { _tag: 'Cancelled' as const } }),
};

const finished = {
  ClickedStartOver: () => ({ state: { _tag: 'Cart' as const } }),
};

const payment = (paymentSelected: boolean) => ({
  _tag: 'Payment' as const,
  paymentSelected,
});

export const Checkout = Node.make('Checkout', {
  model: Schema.Struct({ shipping: Schema.Boolean }),
  state: Schema.TaggedUnion({
    Cart: {},
    Shipping: {},
    Payment: { paymentSelected: Schema.Boolean },
    Review: {
      paymentSelected: Schema.Boolean,
      termsAccepted: Schema.Boolean,
      promo: Promo,
    },
    Placing: { discount: MaybeDiscount },
    Confirmed: { discount: MaybeDiscount, orderId: Schema.String },
    Cancelled: {},
  }),
  message: Schema.TaggedUnion({
    ClickedContinue: {},
    ClickedBack: {},
    ClickedCancel: {},
    ClickedPlaceOrder: {},
    ClickedStartOver: {},
    SelectedEdition: { shipping: Schema.Boolean },
    ToggledPaymentMethod: { selected: Schema.Boolean },
    ToggledTermsAccepted: { accepted: Schema.Boolean },
    SubmittedPromo: { code: Schema.String },
    SucceededPlaceOrder: { orderId: Schema.String },
  }),
  provides: { Review: [Promos] },
  children: { Review: { promo: PromoCode } },
}).build({
  init: () => ({ model: { shipping: true }, state: { _tag: 'Cart' } }),
  provides: {
    Review: ({ send }) =>
      Context.make(Promos, {
        submit: (code) => send({ _tag: 'SubmittedPromo', code }),
      }),
  },
  update: {
    Cart: {
      ...cancellable,
      SelectedEdition: ({ shipping }) => ({ model: { shipping } }),
      ClickedContinue: (_, { model }) => ({
        state: model.shipping ? { _tag: 'Shipping' } : payment(false),
      }),
    },
    Shipping: {
      ...cancellable,
      ClickedContinue: () => ({ state: payment(false) }),
      ClickedBack: () => ({ state: { _tag: 'Cart' } }),
    },
    Payment: {
      ...cancellable,
      ToggledPaymentMethod: ({ selected }) => ({ state: payment(selected) }),
      ClickedContinue: (_, { state }) => ({
        state: {
          _tag: 'Review',
          paymentSelected: state.paymentSelected,
          termsAccepted: false,
          promo: { _tag: 'NoPromo' },
        },
      }),
      ClickedBack: (_, { model }) => ({
        state: model.shipping ? { _tag: 'Shipping' } : { _tag: 'Cart' },
      }),
    },
    Review: {
      ...cancellable,
      ToggledPaymentMethod: ({ selected }, { state }) => ({
        state: { ...state, paymentSelected: selected },
      }),
      ToggledTermsAccepted: ({ accepted }, { state }) => ({
        state: { ...state, termsAccepted: accepted },
      }),
      SubmittedPromo: ({ code }, { state }) => {
        const discount = discountFor(code);
        return {
          state: {
            ...state,
            promo: discount
              ? { _tag: 'AppliedPromo', discount }
              : { _tag: 'RejectedPromo', code },
          },
        };
      },
      ClickedPlaceOrder: (_, { model, state }) =>
        !isReviewReady(state)
          ? {}
          : {
              state: {
                _tag: 'Placing',
                discount:
                  state.promo._tag === 'AppliedPromo'
                    ? state.promo.discount
                    : null,
              },
              commands: [placeOrder(model.shipping)],
            },
      ClickedBack: (_, { state }) => ({
        state: payment(state.paymentSelected),
      }),
    },
    Placing: {
      SucceededPlaceOrder: ({ orderId }, { state }) => ({
        state: { _tag: 'Confirmed', discount: state.discount, orderId },
      }),
    },
    Confirmed: finished,
    Cancelled: finished,
  },
});

/** A payment method is picked and the terms are accepted. */
export const isReviewReady = (review: {
  readonly paymentSelected: boolean;
  readonly termsAccepted: boolean;
}) => review.paymentSelected && review.termsAccepted;
