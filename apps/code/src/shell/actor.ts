import { Effect, Schema, Stream } from 'effect';
import { AiLive, connection } from '@kestack/ai-toolkit/client';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { AiClient } from '@kestack/ai-toolkit/client';
import { home, project, session, settings } from '../places/index.ts';
import { Refused } from '../refusal/index.ts';
import { Projects, Sessions } from '../replica/index.ts';
import { unsettle } from './api.ts';
import * as BackgroundJobs from './background-jobs/index.ts';
import { DeviceState } from './device-state/index.ts';
import * as Home from './home/index.ts';
import * as Project from './project/index.ts';
import * as ProjectPicker from './project-picker/index.ts';
import * as SessionActions from './session-actions/index.ts';
import * as SessionSwitcher from './session-switcher/index.ts';
import * as Settings from './settings/index.ts';

/*
 * The root page, drawn only in the browser. The app is one chain, each link
 * started by the one before:
 *
 * 1. Device State  `Reading` reads what this browser keeps, its Bindings,
 *                  Vim Mode and Unseen marks, before anything is drawn.
 * 2. Server        `Ready` holds it, following every write to it, and
 *                  starts the rest: the connection to the server, so the
 *                  app can say when it is down, and the Replica of its
 *                  records, with every project and session for the
 *                  sidebar, every session's Background Jobs, and the three
 *                  Pickers the app's keys open anywhere: the Project
 *                  Picker, the Session Switcher and Session Actions.
 * 3. Pages         the page the URL names. Kabuki keeps a page whatever
 *                  the root's State, so a page reading the Replica waits
 *                  for it; the View draws pages only once `Ready`.
 *
 * It also opens a session the keyboard steps to, a new session in the
 * project open, and Settings, remembering where it was opened from, so
 * the same key goes back there; and Un-settles a session from the
 * sidebar's Settled List, one at a time, keeping why if the server
 * refuses.
 */

const ConnectionStatus = Schema.Literals([
  'connecting',
  'connected',
  'reconnecting',
]);

/** Where Settings were opened from: a project, a session in it, or home. */
const Back = Schema.Struct({
  projectId: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
});

const placeOf = ({ projectId, sessionId }: typeof Back.Type) =>
  projectId === null
    ? home()
    : sessionId === null
      ? project(projectId)
      : session(projectId, sessionId);

export const Shell = Page.define({
  render: 'client',
  requires: [RpcConnection, Navigation, DeviceState.Store, AiClient],
  metadata: { title: 'code' },
  pages: { Home: Home.Page, Project: Project.Page, Settings: Settings.Page },
  model: Schema.Struct({
    connection: ConnectionStatus,
    /** Where Settings were opened from, while they are open. */
    back: Schema.NullOr(Back),
    /** The Session being Un-settled, and why the server refused, if it did. */
    unsettling: Schema.NullOr(
      Schema.Struct({
        sessionId: Schema.String,
        problem: Schema.NullOr(Schema.String),
      }),
    ),
  }),
  state: Schema.TaggedUnion({
    Reading: {},
    Ready: { device: DeviceState.Device },
  }),
  message: Schema.TaggedUnion({
    Read: { device: DeviceState.Device },
    Connection: { status: ConnectionStatus },
    OpenSession: { projectId: Schema.String, sessionId: Schema.String },
    OpenProject: { projectId: Schema.String },
    /** Settings, from where the app is; null: back from Settings. */
    Settings: { from: Schema.NullOr(Back) },
    SetVim: { on: Schema.Boolean },
    Unsettle: { sessionId: Schema.String },
    Unsettled: { sessionId: Schema.String },
    Refused,
  }),
});

const ReplicasLive = Replicas.child([AiLive]);

const ready = (device: typeof DeviceState.Device.Type) => ({
  state: { _tag: 'Ready' as const, device },
});

export const ShellLive = Page.build(Shell, {
  init: () => ({
    model: { connection: 'connecting', back: null, unsettling: null },
    state: { _tag: 'Reading' },
  }),
  pages: { Home: Home.Live, Project: Project.Live, Settings: Settings.Live },
  // At the top, as the pages are: what they hold waits for the Replica.
  provides: () => Replicas.layer,
  state: {
    // 1. Device State
    Reading: {
      workers: {
        read: {
          run: (self) =>
            Effect.flatMap(DeviceState.read, (device) =>
              self.send({ _tag: 'Read', device }),
            ),
        },
      },
      on: { Read: ({ device }) => ready(device) },
    },
    // 2. Server
    Ready: {
      children: {
        replicas: ReplicasLive,
        projects: { actor: Projects, props: () => ({}) },
        sessions: { actor: Sessions, props: () => ({}) },
        backgroundJobs: { actor: BackgroundJobs.Live },
        projectPicker: { actor: ProjectPicker.Live },
        sessionSwitcher: { actor: SessionSwitcher.Live },
        sessionActions: {
          actor: SessionActions.Live,
          props: ({ state }) => ({ bindings: state.device.bindings }),
        },
      },
      workers: {
        // A write here or in another tab is read again.
        device: {
          run: (self) =>
            Stream.runForEach(DeviceState.changes, () =>
              Effect.flatMap(DeviceState.read, (device) =>
                self.send({ _tag: 'Read', device }),
              ),
            ),
        },
        connection: {
          run: (self) =>
            Stream.runForEach(connection, (status) =>
              self.send({ _tag: 'Connection', status }),
            ),
        },
      },
      on: {
        Read: ({ device }) => ready(device),
        // Shown at once; the write is heard and read back.
        SetVim: ({ on }, { state }) => ({
          ...ready({ ...state.device, vim: on }),
          command: DeviceState.setVim({ on }),
        }),
      },
    },
  },
  on: {
    Connection: ({ status }, { model }) => ({
      model: { ...model, connection: status },
    }),
    OpenSession: ({ projectId, sessionId }) => ({
      command: Router.push(session(projectId, sessionId)),
    }),
    OpenProject: ({ projectId }) => ({
      command: Router.push(project(projectId)),
    }),
    Settings: ({ from }, { model }) =>
      from === null
        ? {
            model: { ...model, back: null },
            command: Router.push(
              placeOf(model.back ?? { projectId: null, sessionId: null }),
            ),
          }
        : { model: { ...model, back: from }, command: Router.push(settings()) },
    Unsettle: ({ sessionId }, { model }) =>
      model.unsettling !== null && model.unsettling.problem === null
        ? {}
        : {
            model: { ...model, unsettling: { sessionId, problem: null } },
            command: unsettle({ sessionId }),
          },
    Unsettled: ({ sessionId }, { model }) =>
      model.unsettling?.sessionId === sessionId
        ? { model: { ...model, unsettling: null } }
        : {},
    Refused: ({ reason }, { model }) =>
      model.unsettling === null
        ? {}
        : {
            model: {
              ...model,
              unsettling: { ...model.unsettling, problem: reason },
            },
          },
  },
});

export const router = Router.define(Shell, {
  notFound: { title: 'Not found · code', robots: 'noindex' },
});
