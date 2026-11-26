import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { Control } from '../contract/index.js';

export const ControlState = Schema.Struct({
  answering: Schema.Boolean,
  stopAsked: Schema.Boolean,
});
export type ControlState = typeof ControlState.Type;

export const control = Fake.make({
  name: 'control',
  state: ControlState,
  initial: { answering: false, stopAsked: false },
  controls: {
    Stop: Fake.control(ControlState, Schema.Struct({}), (_, state) =>
      Effect.flatMap(SubscriptionRef.get(state), (now) =>
        now.answering
          ? SubscriptionRef.set(state, { ...now, stopAsked: true })
          : Effect.fail('Connect is not answering its control socket'),
      ),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      Control,
      Control.of({
        answer: (answers) =>
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              SubscriptionRef.set(state, { answering: true, stopAsked: false }),
              () =>
                SubscriptionRef.update(state, (now) => ({
                  ...now,
                  answering: false,
                })),
            );
            yield* SubscriptionRef.changes(state).pipe(
              Stream.filter((now) => now.stopAsked),
              Stream.runForEach(() =>
                Effect.andThen(
                  answers.stop,
                  SubscriptionRef.update(state, (now) => ({
                    ...now,
                    stopAsked: false,
                  })),
                ),
              ),
              Effect.forkScoped,
            );
          }),
      }),
    ),
});
