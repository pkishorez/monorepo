import { Context, Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

// Where a random face comes from. The Dice needs one; the App gives it.
export class Random extends Context.Service<
  Random,
  { readonly face: Effect.Effect<number> }
>()('docs/Random') {}

export const Dice = Actor.define('Dice', {
  requires: [Random],
  state: Schema.TaggedUnion({ Still: {}, Rolling: {} }),
  // The newest face first.
  model: Schema.Struct({ faces: Schema.Array(Schema.Number) }),
  message: Schema.TaggedUnion({
    Started: {},
    Rolled: { face: Schema.Number },
    Held: {},
  }),
});

export const DiceLive = Dice.build({
  init: () => ({ state: { _tag: 'Still' }, model: { faces: [] } }),
  states: {
    Still: {
      on: { Started: () => ({ state: { _tag: 'Rolling' } }) },
    },
    Rolling: {
      workers: {
        // Rolls once a second, for as long as the Dice is Rolling. The face
        // arrives as a Message, so a Replay draws the same rolls.
        roll: {
          run: (self) =>
            Effect.forever(
              Effect.gen(function* () {
                yield* Effect.sleep('1 second');
                const face = yield* (yield* Random).face;
                yield* self.send({ _tag: 'Rolled', face });
              }),
            ),
        },
      },
      on: {
        Rolled: ({ face }, { model }) => ({
          model: { faces: [face, ...model.faces].slice(0, 6) },
        }),
        Held: () => ({ state: { _tag: 'Still' } }),
      },
    },
  },
});
