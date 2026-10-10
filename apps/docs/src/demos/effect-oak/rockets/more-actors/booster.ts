import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';

/** A booster fires for a moment, then separates and is spent. */
export const Booster = Actor.make('Booster', {
  state: Schema.TaggedUnion({
    Firing: {},
    Spent: {},
  }),
  message: Schema.TaggedUnion({ Separated: {} }),
}).build({
  init: () => ({ state: { _tag: 'Firing' } }),
  lifetime: {
    Firing: (self) =>
      self.send({ _tag: 'Separated' }).pipe(Effect.delay('1500 millis')),
  },
  update: {
    Firing: { Separated: () => ({ state: { _tag: 'Spent' } }) },
  },
});
