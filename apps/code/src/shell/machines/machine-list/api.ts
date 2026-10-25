import { Effect, Schedule, Stream } from 'effect';
import { CloudClient, CodeClient, CodeClients } from '@kestack/connect/code';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * What the Workers of the Machines actor read: the Account's list from the
 * Cloud Connect, over HTTP and signed by the Account signed in, and each
 * Machine's Speech to Text, over its own socket.
 */

export const problemOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message) || 'Cloud Connect could not be reached'
    : 'Cloud Connect could not be reached';

/** The Account's Machines as Cloud Connect lists them now, or why it could not. */
export const list = CloudClient.use((client) => client.List({})).pipe(
  Effect.map((machines) => ({
    _tag: 'Fetched' as const,
    machines,
    at: Date.now(),
  })),
  Effect.catch((error) =>
    Effect.succeed({ _tag: 'Failed' as const, problem: problemOf(error) }),
  ),
);

/** How Speech to Text stands on one Machine, now and on each change; a feed it refuses is tried again a little later. */
export const speechOn = (machineId: string) =>
  CodeClients.stream(
    machineId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(CodeClient, (api) => api.watchSpeechToText())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );
