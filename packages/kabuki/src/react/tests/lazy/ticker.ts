import { Schema } from 'effect';
import { Actor } from '../../../core/index.ts';

/** An Actor kept eager, whose View is loaded lazily from `ticker-view.tsx`. */
export const Ticker = Actor.make('Ticker', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Ticked: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Ticked: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});
