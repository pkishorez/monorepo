import { Context, Effect, Layer, Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { orRefused } from '../../refusal/index.ts';

/*
 * Un-settling a Session from the sidebar's Settled List. The Machine page
 * keeps which Session is being Un-settled, but its own errands reach only
 * what is above it, and the Machine's `AiClient` is what it Provides below:
 * so the call is a Child's, one per Session asked, which tells the page
 * how it ended through `Unsettled`.
 */

/** How the Un-settler tells the Machine page it is done: refused, with why. */
export class Unsettled extends Context.Service<
  Unsettled,
  {
    readonly done: (
      sessionId: string,
      problem: string | null,
    ) => Effect.Effect<void>;
  }
>()('code/Unsettled') {
  static readonly layer = (
    done: (sessionId: string, problem: string | null) => Effect.Effect<void>,
  ) => Layer.succeed(Unsettled, { done });
}

const Unsettler = Actor.define('Unsettler', {
  requires: [AiClient, Unsettled],
  input: Schema.Struct({ sessionId: Schema.String }),
  model: Schema.Struct({ sessionId: Schema.String }),
});

export const UnsettlerLive = Actor.build(Unsettler, {
  init: ({ sessionId }) => ({ model: { sessionId } }),
  workers: {
    unsettle: {
      run: (self) =>
        Effect.gen(function* () {
          const { sessionId } = (yield* self.get).model;
          const ended = yield* orRefused(
            AiClient.use((api) => api.unsettleSession({ sessionId })),
            () => null,
          );
          yield* (yield* Unsettled).done(
            sessionId,
            ended === null ? null : ended.reason,
          );
        }),
    },
  },
});
