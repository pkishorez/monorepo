import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';

/*
 * A bigger Shop, to run live beside the devtools: four levels, keyed
 * Children with subtrees of their own, a State change at every level,
 * Workers with many keys, Commands, and Requests up the tree.
 *
 *   Shop          Loading, Open, Closed; a Session in every State
 *   ├ Session     a heartbeat Worker
 *   ├ Open        a Catalog, a Cart and a RecommendationCarousel
 *   │ ├ Catalog   keyed Items; a thumb Worker per thumbnail queued
 *   │ │ └ Item    Idle, Saving; keyed Reviews; an Upload while Saving
 *   │ │   └ Upload  Sending, Retrying, each with its Worker
 *   │ └ Cart      Empty, Filled, Checkout; a Payment while in Checkout
 *   │   └ Payment Authorising, Challenge, Captured; a 3-D Secure
 *   │             challenge while in Challenge, which polls its Payment
 *   └ Closed      a Notice
 *
 * Its Workers do their work after a short wait, so it plays out by itself:
 * the Shop loads, thumbnails come in and one fails, an Upload fails and
 * retries until its Item is saved, a Payment authorises, is challenged and
 * captured. Its View Sends the rest.
 */

const never = () => Effect.never;
/** After a wait, Send. */
const after =
  <M>(millis: number, message: M) =>
  (self: { readonly send: (message: M) => Effect.Effect<void> }) =>
    Effect.sleep(millis).pipe(Effect.andThen(self.send(message)));

const Review = Actor.define('Review', {
  input: Schema.Struct({ text: Schema.String }),
  model: Schema.Struct({ text: Schema.String }),
});
export const ReviewLive = Actor.build(Review, {
  init: ({ text }) => ({ model: { text } }),
});

const Upload = Actor.define('Upload', {
  state: Schema.TaggedUnion({
    Sending: {},
    Retrying: { attempt: Schema.Number },
  }),
  message: Schema.TaggedUnion({ Failed: {}, Retry: {} }),
});
export const UploadLive = Actor.build(Upload, {
  init: () => ({ state: { _tag: 'Sending' } }),
  state: {
    Sending: {
      workers: { send: { run: after(1400, { _tag: 'Failed' } as const) } },
      on: { Failed: () => ({ state: { _tag: 'Retrying', attempt: 1 } }) },
    },
    Retrying: {
      workers: { backoff: { run: after(900, { _tag: 'Retry' } as const) } },
      on: { Retry: () => ({ state: { _tag: 'Sending' } }) },
    },
  },
});

const Item = Actor.define('Item', {
  input: Schema.Struct({ name: Schema.String, reviews: Schema.Number }),
  model: Schema.Struct({
    name: Schema.String,
    reviews: Schema.Array(Schema.String),
  }),
  state: Schema.TaggedUnion({ Idle: {}, Saving: {} }),
  message: Schema.TaggedUnion({ Save: {}, Saved: {} }),
});
export const ItemLive = Actor.build(Item, {
  init: ({ name, reviews }) => ({
    model: {
      name,
      reviews: Array.from({ length: reviews }, (_, i) => `r${i + 1}`),
    },
    state: { _tag: 'Idle' },
  }),
  children: {
    reviews: {
      actor: ReviewLive,
      each: ({ model }) => model.reviews,
      input: ({ model }, key) => ({ text: `${model.name} ${key}` }),
    },
  },
  state: {
    Idle: { on: { Save: () => ({ state: { _tag: 'Saving' } }) } },
    Saving: {
      children: { upload: { actor: UploadLive } },
      workers: { save: { run: after(6000, { _tag: 'Saved' } as const) } },
      on: { Saved: () => ({ state: { _tag: 'Idle' } }) },
    },
  },
});

const REVIEWS: Record<string, number> = { tea: 3, cup: 2, pot: 0 };

const Catalog = Actor.define('Catalog', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    thumbs: Schema.Array(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Stocked: { ids: Schema.Array(Schema.String) },
    Queued: { ids: Schema.Array(Schema.String) },
    Thumbed: { id: Schema.String },
  }),
});
export const CatalogLive = Actor.build(Catalog, {
  init: () => ({
    model: { ids: ['tea', 'cup', 'pot'], thumbs: ['tea', 'cup', 'pot'] },
  }),
  children: {
    items: {
      actor: ItemLive,
      each: ({ model }) => model.ids,
      input: (_, id) => ({ name: id, reviews: REVIEWS[id] ?? 1 }),
    },
  },
  workers: {
    thumb: {
      each: ({ model }) => model.thumbs,
      // One thumbnail never comes: its Worker fails.
      run: (self, key) =>
        key === 'pot'
          ? Effect.sleep(1500).pipe(Effect.andThen(Effect.die('no image')))
          : Effect.sleep(1500 + ((key.length * 977) % 5000)).pipe(
              Effect.andThen(self.send({ _tag: 'Thumbed', id: key })),
            ),
    },
  },
  on: {
    Stocked: ({ ids }, { model }) => ({
      model: { ...model, ids: [...model.ids, ...ids] },
    }),
    Queued: ({ ids }, { model }) => ({
      model: { ...model, thumbs: [...model.thumbs, ...ids] },
    }),
    Thumbed: ({ id }, { model }) => ({
      model: { ...model, thumbs: model.thumbs.filter((kept) => kept !== id) },
    }),
  },
});

const RecommendationCarousel = Actor.define('RecommendationCarousel', {});
export const RecommendationCarouselLive = Actor.build(RecommendationCarousel, {
  workers: { rotate: { run: never } },
});

const ThreeDSecureChallenge = Actor.define('ThreeDSecureChallenge', {});
export const ThreeDSecureChallengeLive = Actor.build(ThreeDSecureChallenge, {
  workers: { poll: { run: never } },
});

const Payment = Actor.define('Payment', {
  model: Schema.Struct({ polls: Schema.Number }),
  state: Schema.TaggedUnion({ Authorising: {}, Challenge: {}, Captured: {} }),
  message: Schema.TaggedUnion({ Challenged: {}, Polled: {}, Passed: {} }),
});
export const PaymentLive = Actor.build(Payment, {
  init: () => ({ model: { polls: 0 }, state: { _tag: 'Authorising' } }),
  state: {
    Authorising: {
      workers: {
        authorise: { run: after(1500, { _tag: 'Challenged' } as const) },
      },
      on: { Challenged: () => ({ state: { _tag: 'Challenge' } }) },
    },
    Challenge: {
      children: { challenge: { actor: ThreeDSecureChallengeLive } },
      workers: { wait: { run: after(2500, { _tag: 'Polled' } as const) } },
      on: {
        Polled: (_, { model }) => ({
          model: { polls: model.polls + 1 },
          command: capture({ amount: 42 }),
        }),
        Passed: () => ({ state: { _tag: 'Captured' } }),
      },
    },
    Captured: {},
  },
});

const track = Command.make('track', {
  args: Schema.Struct({ count: Schema.Number }),
  run: () => Effect.succeed({ _tag: 'Tracked' as const }),
});

const capture = Command.make('capture', {
  args: Schema.Struct({ amount: Schema.Number }),
  run: () => Effect.succeed({ _tag: 'Passed' as const }),
});

const Cart = Actor.define('Cart', {
  state: Schema.TaggedUnion({
    Empty: {},
    Filled: { count: Schema.Number },
    Checkout: { count: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Put: { item: Schema.String },
    CheckedOut: {},
    Tracked: {},
  }),
});
export const CartLive = Actor.build(Cart, {
  init: () => ({ state: { _tag: 'Empty' } }),
  on: { Tracked: () => ({}) },
  state: {
    Empty: {
      on: {
        Put: () => ({
          state: { _tag: 'Filled', count: 1 },
          command: track({ count: 1 }),
        }),
      },
    },
    Filled: {
      on: {
        Put: (_, { state }) => ({
          state: { _tag: 'Filled', count: state.count + 1 },
          command: track({ count: state.count + 1 }),
        }),
        CheckedOut: (_, { state }) => ({
          state: { _tag: 'Checkout', count: state.count },
        }),
      },
    },
    Checkout: {
      workers: { pay: { run: never } },
      children: { payment: { actor: PaymentLive } },
    },
  },
});

const Session = Actor.define('Session', {
  message: Schema.TaggedUnion({ Beat: {} }),
});
export const SessionLive = Actor.build(Session, {
  workers: {
    heartbeat: {
      run: (self) =>
        Effect.forever(after(5000, { _tag: 'Beat' } as const)(self)),
    },
  },
  on: { Beat: () => ({}) },
});

const Notice = Actor.define('Notice', {});
export const NoticeLive = Actor.build(Notice, {});

const Shop = Actor.define('Shop', {
  state: Schema.TaggedUnion({ Loading: {}, Open: {}, Closed: {} }),
  message: Schema.TaggedUnion({ Loaded: {}, Close: {}, Reopen: {} }),
});
export const ShopLive = Actor.build(Shop, {
  init: () => ({ state: { _tag: 'Loading' } }),
  children: { session: { actor: SessionLive } },
  state: {
    Loading: {
      workers: { fetch: { run: after(1200, { _tag: 'Loaded' } as const) } },
      on: { Loaded: () => ({ state: { _tag: 'Open' } }) },
    },
    Open: {
      children: {
        catalog: { actor: CatalogLive },
        cart: { actor: CartLive },
        recommendations: { actor: RecommendationCarouselLive },
      },
      on: { Close: () => ({ state: { _tag: 'Closed' } }) },
    },
    Closed: {
      children: { notice: { actor: NoticeLive } },
      on: { Reopen: () => ({ state: { _tag: 'Open' } }) },
    },
  },
});
