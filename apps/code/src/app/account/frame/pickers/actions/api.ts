import { Effect } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { reasonOf } from '../../../connection/link/index.ts';

/*
 * What Actions ask of the open Session's Connection, its `CodeClient`
 * given by the caller. Each refusal is a sentence to show in the Picker.
 */

const call = <A, E extends Parameters<typeof reasonOf>[0]>(
  effect: Effect.Effect<A, E, CodeClient>,
) => effect.pipe(Effect.mapError(reasonOf));

/** A new Session from this one's context, up to its latest Turn's end. */
export const forkLatest = (sessionId: string) =>
  call(
    CodeClient.use((api) => api.forkSession({ sessionId, afterTurnId: null })),
  );

export const regenerateTitle = (sessionId: string) =>
  call(CodeClient.use((api) => api.regenerateTitle({ sessionId })));

/** Stops the running Turn. */
export const stop = (sessionId: string) =>
  call(CodeClient.use((api) => api.cancel({ sessionId })));
