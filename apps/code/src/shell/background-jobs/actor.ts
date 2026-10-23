import { Schema, Stream } from 'effect';
import { SessionJobs } from '@kestack/ai-toolkit/api';
import { AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { backgroundJobs, stopBackgroundJob } from './api.ts';

/*
 * Every Machine's sessions' Background Jobs, live, for the bubble that
 * counts them and the sidebar. They live only while a Machine's server
 * runs, so each Machine's list is whatever it last sent: a reconnect
 * starts from its new list, and a restarted server has none.
 *
 * 1. Follow  one Worker per Machine; each list from a Machine replaces
 *            its last.
 * 2. Stop    asks the job's Machine to stop it; it leaves the list when
 *            the Machine says so, and a refusal says why.
 */

/** One session's jobs, and the Machine it is on. */
const MachineJobs = Schema.Struct({
  ...SessionJobs.fields,
  machineId: Schema.String,
});

export const BackgroundJobs = Actor.define('BackgroundJobs', {
  requires: [AiClients],
  props: Schema.Struct({ machineIds: Schema.Array(Schema.String) }),
  model: Schema.Struct({
    sessions: Schema.Array(MachineJobs),
    open: Schema.Boolean,
    /** The jobs asked to stop, by id, until the server answers. */
    stopping: Schema.Array(Schema.String),
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Jobs: { machineId: Schema.String, sessions: Schema.Array(SessionJobs) },
    Open: { open: Schema.Boolean },
    Stop: {
      machineId: Schema.String,
      sessionId: Schema.String,
      jobId: Schema.String,
    },
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
      each: ({ props }) => props.machineIds,
      run: (self, machineId) =>
        Stream.runForEach(backgroundJobs(machineId), (sessions) =>
          self.send({ _tag: 'Jobs', machineId, sessions }),
        ),
    },
  },
  on: {
    Jobs: ({ machineId, sessions: theirs }, { model }) => {
      const sessions = [
        ...model.sessions.filter((each) => each.machineId !== machineId),
        ...theirs.map((each) => ({ ...each, machineId })),
      ];
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
    Stop: ({ machineId, sessionId, jobId }, { model }) =>
      model.stopping.includes(jobId)
        ? {}
        : {
            model: {
              ...model,
              stopping: [...model.stopping, jobId],
              problem: null,
            },
            command: stopBackgroundJob({ machineId, sessionId, jobId }),
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
