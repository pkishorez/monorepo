import { Effect } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { reasonOf } from '../../../refusal/index.ts';

/*
 * What Session Actions ask of the server for the open Session. Each
 * refusal is a sentence to show in the Picker.
 */

const call = <A, E extends Parameters<typeof reasonOf>[0]>(
  effect: Effect.Effect<A, E, AiClient>,
) => effect.pipe(Effect.mapError(reasonOf));

export const settle = (sessionId: string) =>
  call(AiClient.use((api) => api.settleSession({ sessionId })));

export const unsettle = (sessionId: string) =>
  call(AiClient.use((api) => api.unsettleSession({ sessionId })));

/** A new Session from this one's context, up to its latest Turn's end. */
export const forkLatest = (sessionId: string) =>
  call(
    AiClient.use((api) => api.forkSession({ sessionId, afterTurnId: null })),
  );

export const regenerateTitle = (sessionId: string) =>
  call(AiClient.use((api) => api.regenerateTitle({ sessionId })));

/** Stops the running Turn. */
export const stop = (sessionId: string) =>
  call(AiClient.use((api) => api.cancel({ sessionId })));
