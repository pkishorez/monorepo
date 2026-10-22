import { Effect, Schedule, Schema, Stream } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { orRefused } from '../../refusal/index.ts';

/**
 * Every Session's Background Jobs, whole on each change. The server sends
 * the whole list first, so a reconnect starts from it afresh; a feed it
 * refuses is tried again a little later.
 */
export const backgroundJobs = keepSubscribed(() =>
  Stream.unwrap(Effect.map(AiClient, (api) => api.backgroundJobs())),
).pipe(
  Stream.retry(Schedule.spaced('5 seconds')),
  // Retried forever, so it never fails.
  Stream.orDie,
);

export const stopBackgroundJob = Command.make('StopBackgroundJob', {
  args: Schema.Struct({ sessionId: Schema.String, jobId: Schema.String }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.stopBackgroundJob(args)),
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
