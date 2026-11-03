import { Effect, Schema } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { Connections } from '../../../../connections.ts';
import { Seen } from '../../../../connection/store/index.ts';
import { orRefused } from '../../../../connection/link/index.ts';

/*
 * What a session's page asks of the server: stop everything it runs, stop
 * one Background Job, fork after a turn; and what it keeps on this device:
 * how far it was seen.
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

/** Stops one Background Job; the feed drops it once the agent says it stopped. */
export const stopJob = Command.make('StopJob', {
  args: Schema.Struct({ sessionId: Schema.String, jobId: Schema.String }),
  run: (args) =>
    orRefused(
      CodeClient.use((api) => api.stopBackgroundJob(args)),
      () => ({ _tag: 'JobStopped' as const, jobId: args.jobId }),
    ),
});

/**
 * Opens a subagent once a Drawer it was chosen in has slid away: opened at
 * once, the tap that chose it would land on the new one's backdrop and
 * shut it.
 */
export const openAfterDrawer = Command.make('OpenAfterDrawer', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.as(Effect.sleep('400 millis'), {
      _tag: 'DrawerOpened' as const,
      id,
      under: 0,
    }),
});

/** Opens a background command once a Drawer it was chosen in has slid away, as `openAfterDrawer` does a subagent. */
export const openCommandAfterDrawer = Command.make('OpenCommandAfterDrawer', {
  args: Schema.Struct({ jobId: Schema.String }),
  run: ({ jobId }) =>
    Effect.as(Effect.sleep('400 millis'), {
      _tag: 'CommandOpened' as const,
      jobId,
    }),
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

/** Marks the session seen on this device, up to the end of its last turn, in its Connection's database for the Account signed in; a write that fails is lost. */
export const markSeen = Command.make('MarkSeen', {
  args: Schema.Struct({
    connectionId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.String,
    seen: Schema.Finite,
  }),
  run: ({ connectionId, projectId, sessionId, seen }) =>
    Effect.gen(function* () {
      const accountId = yield* (yield* Connections).account;
      yield* (yield* Seen).mark(
        accountId,
        connectionId,
        projectId,
        sessionId,
        seen,
      );
    }),
});
