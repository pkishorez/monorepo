import { Effect, Schedule, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * What the Workers of the Machines actor read: the Account's list from the
 * Machines Backend, over HTTP and signed by the Account signed in, and each
 * Machine's Speech to Text, over its own socket.
 */

export const problemOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message) || 'The Machines Backend could not be reached'
    : 'The Machines Backend could not be reached';

/** The Account's Machines as the Backend lists them now, or why it could not. */
export const list = MachinesClient.use((client) => client.List({})).pipe(
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
  AiClients.stream(
    machineId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(AiClient, (api) => api.watchSpeechToText())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );
