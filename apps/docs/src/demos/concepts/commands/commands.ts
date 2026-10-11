import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';

/**
 * A die. Roll asks for a Command: an errand that sleeps a second, then ends
 * with one Message, Rolled, carrying the value it drew. The value is drawn
 * inside the Command and travels in the Message, so a Replay lands on the
 * same face without running the Command again.
 */
export const Dice = Actor.make('Dice', {
  model: Schema.Struct({ value: Schema.Number, rolling: Schema.Boolean }),
  message: Schema.TaggedUnion({
    Roll: {},
    Rolled: { value: Schema.Number },
  }),
}).build({
  init: () => ({ model: { value: 1, rolling: false } }),
  update: {
    // A Roll while rolling is handled but changes nothing: no second Command.
    Roll: (_, { model }) =>
      model.rolling
        ? {}
        : {
            model: { ...model, rolling: true },
            command: {
              name: 'roll',
              run: Effect.sleep('1 second').pipe(
                Effect.andThen(
                  Effect.sync(() => ({
                    _tag: 'Rolled' as const,
                    value: 1 + Math.floor(Math.random() * 6),
                  })),
                ),
              ),
            },
          },
    Rolled: ({ value }) => ({ model: { value, rolling: false } }),
  },
});
