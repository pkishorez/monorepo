import { Context, Effect, Layer, Schema } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { orRefused } from '../refusal/index.ts';

/*
 * Un-settling a Session from the sidebar's Settled List. The root page
 * keeps which Session is being Un-settled, but its own errands reach only
 * what is above it, and every Machine's client, `AiClients`, is what it
 * Provides below: so the call is a Child's, one per Session asked, made on
 * the Session's own Machine, which tells the page how it ended through
 * `Unsettled`.
 */

/** How the Un-settler tells the root page it is done: refused, with why. */
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
  requires: [AiClients, Unsettled],
  input: Schema.Struct({ machineId: Schema.String, sessionId: Schema.String }),
  model: Schema.Struct({ machineId: Schema.String, sessionId: Schema.String }),
});

export const UnsettlerLive = Actor.build(Unsettler, {
  init: (input) => ({ model: input }),
  workers: {
    unsettle: {
      run: (self) =>
        Effect.gen(function* () {
          const { machineId, sessionId } = (yield* self.get).model;
          const ended = yield* orRefused(
            AiClients.on(
              machineId,
              AiClient.use((api) => api.unsettleSession({ sessionId })),
            ),
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
