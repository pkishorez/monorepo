import { Effect, Schedule, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * The Background Jobs of one Connection: every Session's, whole, then
 * again on each change, over the Connection's own socket; a feed it
 * refuses is tried again a little later. Its Connection follows it and
 * says it in `Connections`, so the sidebar and the open session know a
 * Session works while only its jobs do. Never kept: they live only while
 * their agent does.
 */

/** Every Session's Background Jobs on a Connection, now and on each change. */
export const jobsOn = (connectionId: string) =>
  CodeClients.stream(
    connectionId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(CodeClient, (api) => api.backgroundJobs())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );

/** Stops one of a Session's Background Jobs, over the socket its page Provides. */
export const stopJob = (args: {
  readonly sessionId: string;
  readonly jobId: string;
}) => CodeClient.use((api) => api.stopBackgroundJob(args));
