import { Effect, Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';
import { orRefused } from '../../../refusal/index.ts';

/*
 * What a session's page asks of the server: stop the turn, fork after a
 * turn; and what it keeps on this device: how far it was seen.
 */

export const cancel = Command.make('Cancel', {
  args: Schema.Struct({ sessionId: Schema.String }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.cancel(args)),
      () => ({
        _tag: 'Stopped' as const,
      }),
    ),
});

/** A new Session from this one's context, up to a Turn's end. */
export const forkSession = Command.make('ForkSession', {
  args: Schema.Struct({
    sessionId: Schema.String,
    afterTurnId: Schema.String,
  }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.forkSession(args)),
      (session) => ({
        _tag: 'Forked' as const,
        projectId: session.projectId,
        sessionId: session.id,
      }),
    ),
});

/** Marks the session seen on this device, up to the end of its last turn; a write that fails is lost. */
export const markSeen = Command.make('MarkSeen', {
  args: Schema.Struct({
    machineId: Schema.String,
    sessionId: Schema.String,
    seen: Schema.Finite,
  }),
  run: ({ machineId, sessionId, seen }) =>
    Effect.flatMap(DeviceState, (store) =>
      store.markSeen(machineId, sessionId, seen),
    ).pipe(Effect.ignore),
});
