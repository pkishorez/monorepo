import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { BackgroundJobSchema } from '../../services/harness/wire/index.js';
import { HarnessFailed, SessionNotFound } from './errors.js';

/* Background Jobs: live only while the server runs, never stored. */

/** One harness's Background Jobs, by the Session whose agent started them. */
export const SessionJobs = Schema.Struct({
  sessionId: Schema.String,
  projectId: Schema.String,
  jobs: Schema.Array(BackgroundJobSchema),
});
export type SessionJobs = typeof SessionJobs.Type;

export const JobsRpc = RpcGroup.make(
  /** Every Session's Background Jobs, whole, then again on each change. */
  Rpc.make('backgroundJobs', {
    success: Schema.Array(SessionJobs),
    stream: true,
  }),
  Rpc.make('stopBackgroundJob', {
    payload: { sessionId: Schema.String, jobId: Schema.String },
    error: Schema.Union([SessionNotFound, HarnessFailed]),
  }),
);
