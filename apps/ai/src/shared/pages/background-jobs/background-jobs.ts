import { Schema, Stream } from 'effect';
import { SessionJobs } from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { backgroundJobs, stopBackgroundJob } from '../ai/index.ts';

/*
 * Every session's Background Jobs, live, for the bubble that counts them
 * and the sidebar. They live only while the server runs, so the list is
 * whatever the server last sent: a reconnect starts from its new list, and
 * a restarted server has none.
 *
 * 1. Follow  each list from the server replaces the last.
 * 2. Stop    asks the server to stop one job; it leaves the list when the
 *            server says so, and a refusal says why.
 */

export const BackgroundJobs = Actor.define('BackgroundJobs', {
  requires: [AiClient, RpcConnection],
  model: Schema.Struct({
    sessions: Schema.Array(SessionJobs),
    open: Schema.Boolean,
    /** The jobs asked to stop, by id, until the server answers. */
    stopping: Schema.Array(Schema.String),
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Jobs: { sessions: Schema.Array(SessionJobs) },
    Open: { open: Schema.Boolean },
    Stop: { sessionId: Schema.String, jobId: Schema.String },
    JobStopped: { jobId: Schema.String },
    JobRefused: { jobId: Schema.String, reason: Schema.String },
  }),
});

export const BackgroundJobsLive = Actor.build(BackgroundJobs, {
  init: () => ({
    model: { sessions: [], open: false, stopping: [], problem: null },
  }),
  workers: {
    // 1. Follow
    follow: {
      run: (self) =>
        Stream.runForEach(backgroundJobs, (sessions) =>
          self.send({ _tag: 'Jobs', sessions }),
        ),
    },
  },
  on: {
    Jobs: ({ sessions }, { model }) => {
      const running = new Set(
        sessions.flatMap(({ jobs }) => jobs.map(({ id }) => id)),
      );
      return {
        model: {
          ...model,
          sessions,
          open: model.open && running.size > 0,
          stopping: model.stopping.filter((id) => running.has(id)),
        },
      };
    },
    Open: ({ open }, { model }) => ({
      model: { ...model, open, problem: open ? model.problem : null },
    }),
    // 2. Stop
    Stop: ({ sessionId, jobId }, { model }) =>
      model.stopping.includes(jobId)
        ? {}
        : {
            model: {
              ...model,
              stopping: [...model.stopping, jobId],
              problem: null,
            },
            command: stopBackgroundJob({ sessionId, jobId }),
          },
    JobStopped: () => ({}),
    JobRefused: ({ jobId, reason }, { model }) => ({
      model: {
        ...model,
        stopping: model.stopping.filter((id) => id !== jobId),
        problem: reason,
      },
    }),
  },
});
