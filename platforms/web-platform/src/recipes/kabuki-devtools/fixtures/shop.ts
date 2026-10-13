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

export const Review = Actor.make('Review', {
  input: Schema.Struct({ text: Schema.String }),
  model: Schema.Struct({ text: Schema.String }),
}).build({ init: ({ text }) => ({ model: { text } }) });

export const Upload = Actor.make('Upload', {
  state: Schema.TaggedUnion({
    Sending: {},
    Retrying: { attempt: Schema.Number },
  }),
  message: Schema.TaggedUnion({ Failed: {}, Retry: {} }),
}).build({
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

export const Item = Actor.make('Item', {
  input: Schema.Struct({ name: Schema.String, reviews: Schema.Number }),
  model: Schema.Struct({
    name: Schema.String,
    reviews: Schema.Array(Schema.String),
  }),
  state: Schema.TaggedUnion({ Idle: {}, Saving: {} }),
  message: Schema.TaggedUnion({ Save: {}, Saved: {} }),
}).build({
  init: ({ name, reviews }) => ({
    model: {
      name,
      reviews: Array.from({ length: reviews }, (_, i) => `r${i + 1}`),
    },
    state: { _tag: 'Idle' },
  }),
  children: { reviews: Actor.many(Review) },
  invoke: ({ model }) => ({
    reviews: model.reviews.map((key) => ({
      key,
      input: { text: `${model.name} ${key}` },
    })),
  }),
  state: {
    Idle: { on: { Save: () => ({ state: { _tag: 'Saving' } }) } },
    Saving: {
      children: { upload: Upload },
      workers: { save: { run: after(6000, { _tag: 'Saved' } as const) } },
      on: { Saved: () => ({ state: { _tag: 'Idle' } }) },
    },
  },
});

const REVIEWS: Record<string, number> = { tea: 3, cup: 2, pot: 0 };

export const Catalog = Actor.make('Catalog', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    thumbs: Schema.Array(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Stocked: { ids: Schema.Array(Schema.String) },
    Queued: { ids: Schema.Array(Schema.String) },
    Thumbed: { id: Schema.String },
  }),
}).build({
  init: () => ({
    model: { ids: ['tea', 'cup', 'pot'], thumbs: ['tea', 'cup', 'pot'] },
  }),
  children: { items: Actor.many(Item) },
  invoke: ({ model }) => ({
    items: model.ids.map((id) => ({
      key: id,
      input: { name: id, reviews: REVIEWS[id] ?? 1 },
    })),
  }),
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

export const RecommendationCarousel = Actor.make(
  'RecommendationCarousel',
  {},
).build({
  workers: { rotate: { run: never } },
});

export const ThreeDSecureChallenge = Actor.make(
  'ThreeDSecureChallenge',
  {},
).build({
  workers: { poll: { run: never } },
});

export const Payment = Actor.make('Payment', {
  model: Schema.Struct({ polls: Schema.Number }),
  state: Schema.TaggedUnion({ Authorising: {}, Challenge: {}, Captured: {} }),
  message: Schema.TaggedUnion({ Challenged: {}, Polled: {}, Passed: {} }),
}).build({
  init: () => ({ model: { polls: 0 }, state: { _tag: 'Authorising' } }),
  state: {
    Authorising: {
      workers: {
        authorise: { run: after(1500, { _tag: 'Challenged' } as const) },
      },
      on: { Challenged: () => ({ state: { _tag: 'Challenge' } }) },
    },
    Challenge: {
      children: { challenge: ThreeDSecureChallenge },
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

export const Cart = Actor.make('Cart', {
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
}).build({
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
      children: { payment: Payment },
    },
  },
});

export const Session = Actor.make('Session', {
  message: Schema.TaggedUnion({ Beat: {} }),
}).build({
  workers: {
    heartbeat: {
      run: (self) =>
        Effect.forever(after(5000, { _tag: 'Beat' } as const)(self)),
    },
  },
  on: { Beat: () => ({}) },
});

export const Notice = Actor.make('Notice', {}).build({});

export const Shop = Actor.make('Shop', {
  state: Schema.TaggedUnion({ Loading: {}, Open: {}, Closed: {} }),
  message: Schema.TaggedUnion({ Loaded: {}, Close: {}, Reopen: {} }),
}).build({
  init: () => ({ state: { _tag: 'Loading' } }),
  children: { session: Session },
  state: {
    Loading: {
      workers: { fetch: { run: after(1200, { _tag: 'Loaded' } as const) } },
      on: { Loaded: () => ({ state: { _tag: 'Open' } }) },
    },
    Open: {
      children: {
        catalog: Catalog,
        cart: Cart,
        recommendations: RecommendationCarousel,
      },
      on: { Close: () => ({ state: { _tag: 'Closed' } }) },
    },
    Closed: {
      children: { notice: Notice },
      on: { Reopen: () => ({ state: { _tag: 'Open' } }) },
    },
  },
});
