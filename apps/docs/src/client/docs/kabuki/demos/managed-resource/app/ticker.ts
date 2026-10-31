import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { PriceFeed, priceFeed } from './price-feed.ts';

// One stock's price. It needs a PriceFeed, and doesn't care who opens it.
export const Quote = Actor.define('Quote', {
  requires: [PriceFeed],
  model: Schema.Struct({
    price: Schema.NullOr(Schema.Number),
    change: Schema.Number,
  }),
  message: Schema.TaggedUnion({ Priced: { price: Schema.Number } }),
});

export const QuoteLive = Actor.build(Quote, {
  init: () => ({ model: { price: null, change: 0 } }),
  // Reads the feed every second and a half, for as long as the Quote lives.
  workers: {
    poll: {
      run: (self) =>
        Effect.gen(function* () {
          const feed = yield* PriceFeed;
          while (true) {
            yield* self.send({ _tag: 'Priced', price: yield* feed.next });
            yield* Effect.sleep('1500 millis');
          }
        }),
    },
  },
  on: {
    Priced: ({ price }, { model }) => ({
      model: { price, change: model.price === null ? 0 : price - model.price },
    }),
  },
});

const Line = Schema.Struct({ text: Schema.String, at: Schema.Number });

// Off or On. While On, it opens the feed and shows a Quote.
export const Ticker = Actor.define('Ticker', {
  state: Schema.TaggedUnion({ Off: {}, On: {} }),
  model: Schema.Struct({ log: Schema.Array(Line) }),
  message: Schema.TaggedUnion({
    Switched: {},
    Logged: { text: Schema.String },
  }),
});

export const TickerLive = Actor.build(Ticker, {
  init: () => ({ state: { _tag: 'Off' }, model: { log: [] } }),
  // The feed reports here when it opens and closes, in either State.
  on: {
    Logged: ({ text }, { model, at }) => ({
      model: { log: [...model.log, { text, at }].slice(-3) },
    }),
  },
  states: {
    Off: {
      on: { Switched: () => ({ state: { _tag: 'On' } }) },
    },
    On: {
      // Built on entering On, closed on leaving it: the Quote and its
      // Worker stop first, then the feed closes.
      provides: (self) =>
        priceFeed((text) => self.send({ _tag: 'Logged', text })),
      children: (child) => ({ quote: child(QuoteLive) }),
      on: { Switched: () => ({ state: { _tag: 'Off' } }) },
    },
  },
});
