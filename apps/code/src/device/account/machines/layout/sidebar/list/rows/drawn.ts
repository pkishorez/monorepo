import type { Project, Session } from '@kestack/connect/code';
import type { OnMachine } from '../../../../machine/records/index.ts';

/*
 * What the sidebar draws, and when: only what this device holds, once it
 * is all read, in one step.
 *
 * 1. Read    every Machine shown has its Projects, its Sessions and its
 *            Unseen marks read from this device; until then nothing of
 *            them is drawn, no rows, no counts and no empty words.
 * 2. Keep    while Machines newly shown are read, as the Filter or the
 *            list changes, the last whole read stays drawn, so the list
 *            never empties on the way from one to the next.
 * 3. Arrive  the Machines read, as one key: rows drawn under the same key
 *            and added since arrived live, and move in; a new key draws
 *            its rows afresh, as they are, the first read's included.
 */

/** One Machine's Query, as the sidebar's View reads it. */
export interface Read<Row> {
  readonly props: { readonly machineId: string };
  readonly model: {
    readonly status: 'loading' | 'ready' | 'failed';
    readonly rows: ReadonlyArray<{ readonly row: Row }>;
    readonly neverSynced: ReadonlyArray<string>;
  };
}

/** A whole read of the Machines shown. */
export interface Drawn<P = OnMachine<Project>, S = OnMachine<Session>> {
  /** The Machines read, in order, as one key (3. Arrive). */
  readonly key: string;
  readonly projects: ReadonlyArray<P>;
  readonly sessions: ReadonlyArray<S>;
  /** The Instances, by name, whose Projects never synced on this device. */
  readonly neverSynced: ReadonlyArray<string>;
}

// 1. Read
/**
 * The Machines `machineIds` as one whole read, or null while any is still
 * read: its Projects or Sessions, or its Unseen marks (`marked`).
 */
export const drawnOf = <P, S>(
  machineIds: ReadonlyArray<string>,
  projects: ReadonlyArray<Read<P>>,
  sessions: ReadonlyArray<Read<S>>,
  marked: (machineId: string) => boolean,
): Drawn<P, S> | null => {
  const of = <Row>(reads: ReadonlyArray<Read<Row>>, machineId: string) =>
    reads.find(({ props }) => props.machineId === machineId)?.model;
  const read = machineIds.map((machineId) => ({
    projects: of(projects, machineId),
    sessions: of(sessions, machineId),
    marked: marked(machineId),
  }));
  const whole = read.every(
    (each) =>
      each.marked &&
      each.projects !== undefined &&
      each.projects.status !== 'loading' &&
      each.sessions !== undefined &&
      each.sessions.status !== 'loading',
  );
  if (!whole) return null;
  return {
    key: machineIds.join(' '),
    projects: read.flatMap(
      (each) => each.projects?.rows.map(({ row }) => row) ?? [],
    ),
    sessions: read.flatMap(
      (each) => each.sessions?.rows.map(({ row }) => row) ?? [],
    ),
    neverSynced: read.flatMap((each) => each.projects?.neverSynced ?? []),
  };
};

// 2. Keep
/** What to draw: the read now while it is whole, else the last that was. */
export const keptOf = <D>(now: D | null, last: D | null) => now ?? last;
