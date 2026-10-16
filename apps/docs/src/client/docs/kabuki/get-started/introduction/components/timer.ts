import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const Timer = Actor.define('Timer', {
  state: Schema.TaggedUnion({ Stopped: {}, Running: {} }),
  model: Schema.Struct({ seconds: Schema.Number }),
  message: Schema.TaggedUnion({ Started: {}, Ticked: {}, Paused: {} }),
});

export const TimerLive = Actor.build(Timer, {
  init: () => ({ state: { _tag: 'Stopped' }, model: { seconds: 0 } }),
  state: {
    Stopped: {
      on: { Started: () => ({ state: { _tag: 'Running' } }) },
    },
    Running: {
      // Runs while the State is Running, and stops the moment it is not.
      workers: {
        tick: {
          run: (self) =>
            Effect.forever(
              Effect.sleep('1 second').pipe(
                Effect.andThen(self.send({ _tag: 'Ticked' })),
              ),
            ),
        },
      },
      on: {
        Ticked: (_, { model }) => ({ model: { seconds: model.seconds + 1 } }),
        Paused: () => ({ state: { _tag: 'Stopped' } }),
      },
    },
  },
});
