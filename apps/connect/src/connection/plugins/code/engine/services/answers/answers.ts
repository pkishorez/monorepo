import { Deferred, Effect, Layer } from 'effect';
import { Answers, type AnswerOutcome } from '../../capabilities/index.js';

/*
 * The Answers: one Deferred per waiting caller, by Answer id. It is added
 * before the caller Sends, so an outcome can never come before it, and
 * removed as the wait ends, so a caller that is interrupted leaves nothing
 * behind and an outcome that comes after it is dropped.
 */

const make = Effect.sync(() => {
  const waiting = new Map<string, Deferred.Deferred<AnswerOutcome>>();
  return {
    await: <E>(answerId: string, send: Effect.Effect<void, E>) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const outcome = Deferred.makeUnsafe<AnswerOutcome>();
          waiting.set(answerId, outcome);
          return outcome;
        }),
        (outcome) => Effect.andThen(send, Deferred.await(outcome)),
        () => Effect.sync(() => void waiting.delete(answerId)),
      ),
    settle: (answerId: string, outcome: AnswerOutcome) =>
      Effect.suspend(() => {
        const caller = waiting.get(answerId);
        return caller === undefined
          ? Effect.void
          : Effect.asVoid(Deferred.succeed(caller, outcome));
      }),
  };
});

export const answers: Layer.Layer<Answers> = Layer.effect(Answers, make);
