import { Effect, Schedule, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { reasonOf } from '../../refusal/index.ts';

/*
 * What a Dictation asks of the Machines, each over its own socket: whether
 * one can transcribe now, and the text of a clip.
 */

/** Whether one Machine's Speech to Text is Ready, now and on each change; a feed it refuses is tried again a little later. */
export const readyOn = (machineId: string) =>
  AiClients.stream(
    machineId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(AiClient, (api) => api.watchSpeechToText())),
    ),
  ).pipe(
    Stream.map(({ _tag }) => _tag === 'Ready'),
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
    Stream.changes,
  );

/** Whether one Machine's socket is up, now and on each change. */
export const answeringOn = (machineId: string) =>
  AiClients.connection(machineId).pipe(
    Stream.map((status) => status === 'connected'),
    Stream.changes,
  );

/** The text spoken in `audio`, transcribed on one Machine, or why not. */
export const transcribe = (machineId: string, audio: Uint8Array) =>
  AiClients.on(
    machineId,
    AiClient.use((api) => api.transcribe({ audio })),
  ).pipe(
    Effect.map((text) => ({ _tag: 'Said' as const, text })),
    Effect.catch((cause) =>
      Effect.succeed({ _tag: 'NotSaid' as const, reason: reasonOf(cause) }),
    ),
  );
