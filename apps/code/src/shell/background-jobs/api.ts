import { Effect, Schedule, Schema, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { orRefused } from '../../refusal/index.ts';

/**
 * One Machine's sessions' Background Jobs, whole on each change, over its
 * own socket. The Machine sends the whole list first, so a reconnect
 * starts from it afresh; a feed it refuses is tried again a little later.
 */
export const backgroundJobs = (machineId: string) =>
  AiClients.stream(
    machineId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(AiClient, (api) => api.backgroundJobs())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );

export const stopBackgroundJob = Command.make('StopBackgroundJob', {
  args: Schema.Struct({
    machineId: Schema.String,
    sessionId: Schema.String,
    jobId: Schema.String,
  }),
  run: ({ machineId, ...args }) =>
    orRefused(
      AiClients.on(
        machineId,
        AiClient.use((api) => api.stopBackgroundJob(args)),
      ),
      () => ({ _tag: 'JobStopped' as const, jobId: args.jobId }),
    ).pipe(
      Effect.map((result) =>
        result._tag === 'Refused'
          ? {
              _tag: 'JobRefused' as const,
              jobId: args.jobId,
              reason: result.reason,
            }
          : result,
      ),
    ),
});
