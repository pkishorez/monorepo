import { Schema, Stream } from 'effect';
import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { session } from '../../places/index.ts';
import { everything } from '../../replica/index.ts';
import * as Picker from '../../ui/picker/index.ts';

/*
 * The Session Switcher: every Session to go back to, across Projects.
 *
 * 1. Read    every Session and its Project's name, followed while open:
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
  id: Schema.String,
  projectId: Schema.String,
  title: Schema.String,
  project: Schema.String,
  /** How its last Turn stands, when worth saying. */
  status: Schema.NullOr(Schema.String),
  settled: Schema.Boolean,
});
type Listed = typeof Listed.Type;

const Sessions = Picker.make('SessionSwitcher', {
  props: Schema.Struct({
    sessions: Schema.NullOr(Schema.Array(Listed)),
    /** The Session open, if one is. */
    open: Schema.NullOr(Schema.String),
  }),
  steps: {
    session: {
      placeholder: () => 'Search sessions',
      empty: () => 'No session by that name',
      rows: ({ props }) => ({
        rows: (props.sessions ?? []).map((each) => ({
          value: each.id,
          label: each.title || 'Untitled session',
          hint:
            each.status === null
              ? each.project
              : `${each.project} · ${each.status}`,
          checked: each.id === props.open,
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
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<Listed> => {
  const names = new Map(projects.map(({ id, name }) => [id, name]));
  const by = (at: (each: Session) => number) => (a: Session, b: Session) =>
    at(b) - at(a);
  const unsettled = sessions
    .filter(({ settledAt }) => settledAt === null)
    .sort(by(({ activeAt }) => activeAt));
  const settled = sessions
    .filter(({ settledAt }) => settledAt !== null)
    .sort(by(({ settledAt }) => settledAt ?? 0));
  return [...unsettled, ...settled].map((each) => ({
    id: each.id,
    projectId: each.projectId,
    title: each.title,
    project: names.get(each.projectId) ?? '',
    status: STATUS[each.status],
    settled: each.settledAt !== null,
  }));
};

export const SessionSwitcher = Actor.define('SessionSwitcher', {
  requires: [Navigation, Replicas],
  model: Schema.Struct({
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    /** The Session open when it was opened. */
    open: Schema.NullOr(Schema.String),
    sessions: Schema.NullOr(Schema.Array(Listed)),
  }),
  message: Schema.TaggedUnion({
    Open: { how: Picker.How, open: Schema.NullOr(Schema.String) },
    Read: { sessions: Schema.Array(Listed) },
    Closed: {},
    Chose: { sessionId: Schema.String },
  }),
});

export const SessionSwitcherLive = Actor.build(SessionSwitcher, {
  init: () => ({
    model: { picking: null, opened: 0, open: null, sessions: null },
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
            : { _tag: 'Chose', sessionId: chosen },
        );
      },
    }),
  workers: {
    // 1. Read
    sessions: {
      while: ({ model }) => model.picking !== null,
      run: (self) =>
        Stream.runForEach(everything, ({ projects, sessions }) =>
          self.send({ _tag: 'Read', sessions: listOf(projects, sessions) }),
        ),
    },
  },
  on: {
    Open: ({ how, open }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: { ...model, picking: how, open, opened: model.opened + 1 },
          },
    Read: ({ sessions }, { model }) => ({ model: { ...model, sessions } }),
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Pick
    Chose: ({ sessionId }, { model }) => {
      const found = model.sessions?.find(({ id }) => id === sessionId);
      return {
        model: { ...model, picking: null },
        ...(found === undefined
          ? {}
          : { command: Router.push(session(found.projectId, found.id)) }),
      };
    },
  },
});

export const SessionsView = Sessions.View;
