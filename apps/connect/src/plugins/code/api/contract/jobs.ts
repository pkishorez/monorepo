import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { BackgroundJobSchema } from '@kestack/ai-toolkit/contract';
import { HarnessFailed, SessionNotFound } from './errors.js';

/* Background Jobs: live only while the server runs, never stored. */

/** One harness's Background Jobs, by the Session whose agent started them. */
export const SessionJobs = ESchema.make('SessionJobs', {
  sessionId: Schema.String,
  projectId: Schema.String,
  jobs: Schema.Array(BackgroundJobSchema),
}).build();
export type SessionJobs = typeof SessionJobs.Type;

export const JobsRpc = RpcGroup.make(
  /** Every Session's Background Jobs, whole, then again on each change. */
  Rpc.make('backgroundJobs', {
    success: Schema.Array(SessionJobs.schema),
    stream: true,
  }),
  Rpc.make('stopBackgroundJob', {
    payload: ESchema.make('StopBackgroundJobPayload', {
      sessionId: Schema.String,
      jobId: Schema.String,
    }).build().schema,
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
  /**
   * What one of a Session's Background Jobs writes: the last of it at
   * once, then each piece as it comes, until the job ends. Nothing for a
   * job whose output its harness does not show.
   */
  Rpc.make('backgroundJobOutput', {
    payload: ESchema.make('BackgroundJobOutputPayload', {
      sessionId: Schema.String,
      jobId: Schema.String,
    }).build().schema,
    success: Schema.String,
    error: SessionNotFound,
    stream: true,
  }),
);
