import { Effect, Schema, Stream } from 'effect';
import type { Project, Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Machines } from '../../../machines.ts';
import { session } from '../../../../../routes/index.ts';
import { everything, type OnMachine } from '../../../machine/records/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';

/*
 * The Session Switcher: every Session to go back to, across Projects and
 * Machines.
 *
 * 1. Read    every Session and its Project's name, and its Machine's while
 *            there is more than one, followed while open:
 *            the unsettled ones, most recently active first, then the
 *            Settled ones, drawn quieter, most recently Settled first.
 * 2. Pick    a Session opens it, and the keyboard goes on to the page,
 *            wherever it was opened from; the one open is checked.
 */

const STATUS = {
  idle: null,
  running: 'running',
  cancelled: 'stopped',
  failed: 'failed',
  interrupted: 'interrupted',
} as const;

const Listed = Schema.Struct({
  machineId: Schema.String,
  id: Schema.String,
  projectId: Schema.String,
  title: Schema.String,
  project: Schema.String,
  /** How its last Turn stands, when worth saying. */
  status: Schema.NullOr(Schema.String),
  settled: Schema.Boolean,
});
type Listed = typeof Listed.Type;

/** A Session, by its Machine and its id. */
const Here = Schema.Struct({ machineId: Schema.String, id: Schema.String });

/** A row's value: its Session's Machine and id, which no id holds a space of. */
const valueOf = ({ machineId, id }: typeof Here.Type) => `${machineId} ${id}`;

const Sessions = Picker.make('SessionSwitcher', {
  props: Schema.Struct({
    sessions: Schema.NullOr(Schema.Array(Listed)),
    /** The Session open, if one is. */
    open: Schema.NullOr(Here),
  }),
  steps: {
    session: {
      placeholder: () => 'Search sessions',
      empty: () => 'No session by that name',
      rows: ({ props }) => ({
        rows: (props.sessions ?? []).map((each) => ({
          value: valueOf(each),
          label: each.title || 'Untitled session',
          hint:
            each.status === null
              ? each.project
              : `${each.project} · ${each.status}`,
          checked:
            props.open !== null &&
            each.machineId === props.open.machineId &&
            each.id === props.open.id,
          ...(each.settled ? { group: 'Settled', quiet: true } : {}),
        })),
        loading: props.sessions === null,
      }),
    },
  },
  // A Session chosen opens: the keyboard goes there.
  lands: () => true,
});

/** 1. Read: the unsettled by activity, then the Settled by when. */
const listOf = (
  projects: ReadonlyArray<OnMachine<Project>>,
  sessions: ReadonlyArray<OnMachine<Session>>,
  machines: ReadonlyMap<string, string>,
): ReadonlyArray<Listed> => {
  const names = new Map(
    projects.map(({ machineId, id, name }) => [`${machineId}/${id}`, name]),
  );
  const by =
    (at: (each: Session) => number) =>
    (a: OnMachine<Session>, b: OnMachine<Session>) =>
      at(b) - at(a);
  const unsettled = sessions
    .filter(({ settledAt }) => settledAt === null)
    .sort(by(({ activeAt }) => activeAt));
  const settled = sessions
    .filter(({ settledAt }) => settledAt !== null)
    .sort(by(({ settledAt }) => settledAt ?? 0));
  return [...unsettled, ...settled].map((each) => {
    const project = names.get(`${each.machineId}/${each.projectId}`) ?? '';
    const machine =
      machines.size < 2 ? undefined : machines.get(each.machineId);
    return {
      machineId: each.machineId,
      id: each.id,
      projectId: each.projectId,
      title: each.title,
      project: machine === undefined ? project : `${project} · ${machine}`,
      status: STATUS[each.status],
      settled: each.settledAt !== null,
    };
  });
};

/** A Machine, as the Switcher names it. */
const Machine = Schema.Struct({ id: Schema.String, name: Schema.String });
const sameMachines = Schema.toEquivalence(Schema.Array(Machine));

export const SessionSwitcher = Actor.define('SessionSwitcher', {
  requires: [Navigation, Replicas, Machines],
  model: Schema.Struct({
    /** The Machines its Sessions are on, as `Machines` lists them. */
    machines: Schema.Array(Machine),
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    /** The Session open when it was opened. */
    open: Schema.NullOr(Here),
    sessions: Schema.NullOr(Schema.Array(Listed)),
  }),
  message: Schema.TaggedUnion({
    MachinesKnown: { machines: Schema.Array(Machine) },
    Open: { how: Picker.How, open: Schema.NullOr(Here) },
    Read: { sessions: Schema.Array(Listed) },
    Closed: {},
    /** The row chosen, by `valueOf`. */
    Chose: { value: Schema.String },
  }),
});

export const SessionSwitcherLive = Actor.build(SessionSwitcher, {
  init: () => ({
    model: {
      machines: [],
      picking: null,
      opened: 0,
      open: null,
      sessions: null,
    },
  }),
  children: {
    picker: {
      actor: Sessions.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'session', key: '' },
        choices: [],
      }),
      props: ({ model }) => ({ sessions: model.sessions, open: model.open }),
    },
  },
  provides: (self) =>
    Sessions.owner({
      done: (choices) => {
        const chosen = choices?.at(-1)?.value;
        return self.send(
          chosen === undefined
            ? { _tag: 'Closed' }
            : { _tag: 'Chose', value: chosen },
        );
      },
    }),
  workers: {
    // 1. Read: the Machines' ids and names only, so nothing else of a
    // Machine changes anything here.
    machines: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ machines }) =>
              (machines ?? []).map(({ id, name }) => ({ id, name })),
            ),
            Stream.changesWith(sameMachines),
            Stream.runForEach((machines) =>
              self.send({ _tag: 'MachinesKnown', machines }),
            ),
          ),
        ),
    },
    // Read again for the Machines listed, while it is open.
    sessions: {
      each: ({ model }) =>
        model.picking === null
          ? []
          : [model.machines.map(({ id }) => id).join(' ')],
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) => {
          const machines = new Map(
            model.machines.map(({ id, name }) => [id, name]),
          );
          return Stream.runForEach(
            everything([...machines.keys()]),
            ({ projects, sessions }) =>
              self.send({
                _tag: 'Read',
                sessions: listOf(projects, sessions, machines),
              }),
          );
        }),
    },
  },
  on: {
    MachinesKnown: ({ machines }, { model }) => ({
      model: { ...model, machines },
    }),
    Open: ({ how, open }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: { ...model, picking: how, open, opened: model.opened + 1 },
          },
    Read: ({ sessions }, { model }) => ({ model: { ...model, sessions } }),
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Pick
    Chose: ({ value }, { model }) => {
      const found = model.sessions?.find((each) => valueOf(each) === value);
      return {
        model: { ...model, picking: null },
        ...(found === undefined
          ? {}
          : {
              command: Router.push(
                session(found.machineId, found.projectId, found.id),
              ),
            }),
      };
    },
  },
});

export const SessionsView = Sessions.View;
