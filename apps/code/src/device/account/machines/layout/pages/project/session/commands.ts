import { Effect, Schema } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { Machines } from '../../../../machines.ts';
import { Seen } from '../../../../machine/store/index.ts';
import { orRefused } from '../../../../machine/connection/index.ts';

/*
 * What a session's page asks of the server: stop the turn, fork after a
 * turn; and what it keeps on this device: how far it was seen.
 */

export const cancel = Command.make('Cancel', {
  args: Schema.Struct({ sessionId: Schema.String }),
  run: (args) =>
    orRefused(
      CodeClient.use((api) => api.cancel(args)),
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
      CodeClient.use((api) => api.forkSession(args)),
      (session) => ({
        _tag: 'Forked' as const,
        projectId: session.projectId,
        sessionId: session.id,
      }),
    ),
});

/** Marks the session seen on this device, up to the end of its last turn, in its Machine's database for the Account signed in; a write that fails is lost. */
export const markSeen = Command.make('MarkSeen', {
  args: Schema.Struct({
    machineId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.String,
    seen: Schema.Finite,
  }),
  run: ({ machineId, projectId, sessionId, seen }) =>
    Effect.gen(function* () {
      const accountId = yield* (yield* Machines).account;
      yield* (yield* Seen).mark(
        accountId,
        machineId,
        projectId,
        sessionId,
        seen,
      );
    }),
});
