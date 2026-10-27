import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { across, Projects } from '../../../machine/records/index.ts';
import { Machines } from '../../../machines.ts';

/*
 * The home page: every Machine's projects to pick from, and the way to the
 * Project Picker, the only thing to do while there are none. It reads the
 * Machine List for which Machines to read, one Query each; with none
 * listed, or none to be had, the Machines say why and how to start one.
 * Nothing is drawn until the list kept on this device, and each Machine's
 * projects it holds, are read; its View says once that it is (`readyOf`),
 * so Layout first draws it whole.
 */

const Known = Schema.Struct({
  /** Whether the list kept on this device has been read, kept or not. */
  read: Schema.Boolean,
  /** The listed Machines' ids; null before any list. */
  machineIds: Schema.NullOr(Schema.Array(Schema.String)),
  /** Why Cloud Connect could not list them, while nothing is listed. */
  problem: Schema.NullOr(Schema.String),
});

export const Home = Page.define({
  path: '/',
  requires: [Machines],
  metadata: { title: 'Projects · code' },
  model: Schema.Struct({
    ...Known.fields,
    /** Whether it could once be drawn whole, from this device. */
    ready: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Known: Known.fields,
    /** The kept list and each Machine's projects held here are read. */
    Ready: {},
  }),
});

const sameKnown = Schema.toEquivalence(Known);

/** One Machine's projects, as home reads them. */
interface Read {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly rows: ReadonlyArray<unknown>;
  readonly neverSynced: ReadonlyArray<string>;
}

/**
 * What home draws: nothing, until the list kept here and each Machine's
 * projects are read, or while the Machines say why there are none; a
 * skeleton while a Machine never synced here, or none was ever listed and
 * Cloud Connect is asked; no project yet, only once that is known; or the
 * projects.
 */
export const showingOf = (
  known: typeof Known.Type,
  projects: ReadonlyArray<Read>,
): 'nothing' | 'waiting' | 'empty' | 'projects' => {
  if (
    !known.read ||
    known.machineIds?.length === 0 ||
    (known.machineIds === null && known.problem !== null) ||
    projects.length < (known.machineIds?.length ?? 0) ||
    projects.some(({ status }) => status === 'loading')
  )
    return 'nothing';
  if (projects.some(({ rows }) => rows.length > 0)) return 'projects';
  return known.machineIds === null ||
    projects.some(({ neverSynced }) => neverSynced.length > 0)
    ? 'waiting'
    : 'empty';
};

/**
 * Whether home can be drawn whole: the list kept here read, and each listed
 * Machine's projects held here; with none listed, the Machines say why.
 */
export const readyOf = (
  known: typeof Known.Type,
  projects: ReadonlyArray<Read>,
) =>
  known.read &&
  projects.length >= (known.machineIds?.length ?? 0) &&
  !projects.some(({ status }) => status === 'loading');

export const HomeLive = Page.build(Home, {
  init: () => ({
    model: { read: false, machineIds: null, problem: null, ready: false },
  }),
  workers: {
    known: {
      run: (self) =>
        // Only their ids, so a line or a download changes nothing here.
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ savedRead, machines, problem }) => ({
              read: savedRead,
              machineIds: machines?.map(({ id }) => id) ?? null,
              problem: machines === null ? problem : null,
            })),
            Stream.changesWith(sameKnown),
            Stream.runForEach((known) =>
              self.send({ _tag: 'Known', ...known }),
            ),
          ),
        ),
    },
  },
  children: {
    projects: {
      actor: Projects,
      each: ({ model }) => across.each(model.machineIds ?? []),
      props: (_, key) => across.props(key),
    },
  },
  on: {
    Known: ({ read, machineIds, problem }, { model }) => ({
      model: { ...model, read, machineIds, problem },
    }),
    Ready: (_, { model }) =>
      model.ready ? {} : { model: { ...model, ready: true } },
  },
});
