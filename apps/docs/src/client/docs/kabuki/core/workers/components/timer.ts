import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const Timer = Actor.define('Timer', {
  state: Schema.TaggedUnion({ Stopped: {}, Running: {} }),
  model: Schema.Struct({ seconds: Schema.Number }),
  message: Schema.TaggedUnion({
    Started: {},
    Ticked: {},
    Paused: {},
    Reset: {},
  }),
});

export const TimerLive = Timer.build({
  init: () => ({ state: { _tag: 'Stopped' }, model: { seconds: 0 } }),
  states: {
    Stopped: {
      on: {
        Started: () => ({ state: { _tag: 'Running' } }),
        Reset: () => ({ model: { seconds: 0 } }),
      },
    },
    Running: {
      // Lives in Running: it starts when the timer starts, and stops the
      // moment the timer leaves Running. Nothing else starts or stops it.
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
