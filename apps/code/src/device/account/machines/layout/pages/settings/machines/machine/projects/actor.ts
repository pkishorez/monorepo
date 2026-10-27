import { Schema, Stream } from 'effect';
import { CodeClients, type Project, type Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import {
  Cache,
  SavedDrafts,
  Seen,
  Sync,
} from '../../../../../../machine/store/index.ts';
import { Machines } from '../../../../../../machines.ts';
import { Storage } from '../../../../../../../store/index.ts';
import { everything } from '../../../../../../machine/records/index.ts';
import { Refused } from '../../../../../../machine/connection/index.ts';
import { removeProject } from '../../../../../../machine/index.ts';

/*
 * One Machine's Projects, in Settings, as this device holds them synced.
 *
 * 1. Listed  every Project not removed, the most recently active first: a
 *            Turn started or ended in it, else when it was added; each
 *            with whether its folder is there, as its Machine last found
 *            it. Followed while Settings are open.
 * 2. Open    tapping a row opens it under its row, one at a time, and
 *            again closes it.
 * 3. Remove  asks first; confirmed, its Machine removes it and its
 *            Sessions, and this device forgets all it kept of it, as the
 *            project page does. Gone from the list, the question closes;
 *            refused, it says why.
 */

const Row = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  missing: Schema.Boolean,
  /** When a Turn last started or ended in it, else when it was added. */
  activeAt: Schema.Finite,
});
export type Row = typeof Row.Type;

const sameRows = Schema.toEquivalence(Schema.Array(Row));

/** Each Project, the most recently active first. */
export const rowsOf = (
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<Row> => {
  const active = new Map<string, number>();
  for (const { projectId, activeAt, endedAt } of sessions)
    active.set(
      projectId,
      Math.max(active.get(projectId) ?? 0, activeAt, endedAt ?? 0),
    );
  return projects
    .map(({ id, name, path, folder, createdAt }) => ({
      id,
      name,
      path,
      missing: folder === 'missing',
      activeAt: active.get(id) ?? createdAt,
    }))
    .sort((a, b) => b.activeAt - a.activeAt);
};

const MachineProjects = Actor.define('MachineProjects', {
  requires: [
    Replicas,
    CodeClients,
    Machines,
    Sync,
    Seen,
    Storage,
    Cache,
    SavedDrafts,
  ],
  input: Schema.Struct({ machineId: Schema.String }),
  model: Schema.Struct({
    machineId: Schema.String,
    /** Null until read. */
    rows: Schema.NullOr(Schema.Array(Row)),
    /** The row open under itself. */
    open: Schema.NullOr(Schema.String),
    /** The Project Remove is asking about. */
    asking: Schema.NullOr(Schema.String),
    removing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Read: { rows: Schema.Array(Row) },
    Toggled: { id: Schema.String },
    Ask: { id: Schema.String },
    Keep: {},
    Remove: {},
    Removed: {},
    RemoveRefused: Refused,
  }),
});

export const MachineProjectsLive = Actor.build(MachineProjects, {
  init: ({ machineId }) => ({
    model: {
      machineId,
      rows: null,
      open: null,
      asking: null,
      removing: false,
      problem: null,
    },
  }),
  workers: {
    // 1. Listed
    read: {
      run: (self) =>
        self.get.pipe(
          Stream.fromEffect,
          Stream.flatMap(({ model }) => everything([model.machineId])),
          Stream.map(({ projects, sessions }) => rowsOf(projects, sessions)),
          Stream.changesWith(sameRows),
          Stream.runForEach((rows) => self.send({ _tag: 'Read', rows })),
        ),
    },
  },
  on: {
    Read: ({ rows }, { model }) => {
      const has = (id: string | null) =>
        id !== null && rows.some((row) => row.id === id);
      return {
        model: {
          ...model,
          rows,
          open: has(model.open) ? model.open : null,
          // 3. Gone from the list: nothing left to ask about.
          ...(has(model.asking)
            ? {}
            : { asking: null, removing: false, problem: null }),
        },
      };
    },
    // 2. Open
    Toggled: ({ id }, { model }) => ({
      model: { ...model, open: model.open === id ? null : id },
    }),
    // 3. Remove
    Ask: ({ id }, { model }) =>
      model.removing ? {} : { model: { ...model, asking: id, problem: null } },
    Keep: (_, { model }) =>
      model.removing
        ? {}
        : { model: { ...model, asking: null, problem: null } },
    Remove: (_, { model }) =>
      model.asking === null || model.removing
        ? {}
        : {
            model: { ...model, removing: true, problem: null },
            command: removeProject({
              machineId: model.machineId,
              id: model.asking,
            }),
          },
    Removed: (_, { model }) => ({
      model: { ...model, asking: null, removing: false },
    }),
    RemoveRefused: ({ reason }, { model }) => ({
      model: { ...model, removing: false, problem: reason },
    }),
  },
});
