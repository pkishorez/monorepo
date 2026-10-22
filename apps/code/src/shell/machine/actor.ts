import { Effect, Layer, Schema, Stream } from 'effect';
import { AiLive } from '@kestack/ai-toolkit/client';
import { Machine as MachineRecord } from '@kestack/ai-toolkit/machines';
import { Command } from '@kestack/kabuki';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { home, project, session, settings } from '../../places/index.ts';
import { Refused } from '../../refusal/index.ts';
import { Projects, Sessions } from '../../replica/index.ts';
import { DeviceState } from '../device-state/index.ts';
import { Machines } from '../machines/index.ts';
import * as BackgroundJobs from './background-jobs/index.ts';
import * as Socket from './connection/index.ts';
import * as Home from './home/index.ts';
import * as MachineSwitcher from './machine-switcher/index.ts';
import * as Project from './project/index.ts';
import * as ProjectPicker from './project-picker/index.ts';
import * as SessionActions from './session-actions/index.ts';
import * as SessionSwitcher from './session-switcher/index.ts';
import * as Settings from './settings/index.ts';
import { onMachine } from './socket.ts';
import { Unsettled, UnsettlerLive } from './unsettle.ts';

/*
 * One Machine's page, `/m/:machineId`: every place under it is on that
 * Machine. A Machine is its own page so that everything of it is built and
 * closed with the page: switching Machine is a new page, made again for
 * its new id.
 *
 * 1. Provide  the Machine's socket, its Replicas and `CurrentMachine` to
 *             everything under it (`socket.ts`): the pages, the sidebar's
 *             Queries, the Pickers. Nothing above reaches the Machine.
 * 2. Hold     the Replica, with every project and session for the
 *             sidebar, the socket's state for the header, every session's
 *             Background Jobs, the Machine Switcher, and the three Pickers
 *             the app's keys open anywhere: the Project Picker, the Session
 *             Switcher and Session Actions.
 * 3. Know     the Machine as listed, and the Device State it reads: its
 *             Unseen marks and the Bindings; once listed, this device
 *             remembers it as the Account's last Machine.
 * 4. Pages    its home, a project, and Settings. While the Machine is out
 *             of reach they show what was last synced, read-only.
 *
 * It also opens a session the keyboard steps to, a new session in the
 * project open, and Settings, remembering where it was opened from, so
 * the same key goes back there; and Un-settles a session from the
 * sidebar's Settled List, one at a time, keeping why if the server
 * refuses.
 */

/** Where Settings were opened from: a project, a session in it, or home. */
const Back = Schema.Struct({
  projectId: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
});

export const Machine = Page.define({
  path: '/m/:machineId',
  params: { machineId: Schema.String },
  requires: [Navigation, DeviceState.Store, Machines],
  metadata: { title: 'code' },
  pages: { Home: Home.Page, Project: Project.Page, Settings: Settings.Page },
  model: Schema.Struct({
    /** The Account's Machines as listed; null before any list. */
    machines: Schema.NullOr(Schema.Array(MachineRecord)),
    /** Whether the Backend has answered, so a Machine missing is gone. */
    fetched: Schema.Boolean,
    /** Device State, once read. */
    device: Schema.NullOr(DeviceState.Device),
    /** Whether this device has remembered it as the Account's last Machine. */
    remembered: Schema.Boolean,
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
  message: Schema.TaggedUnion({
    Known: {
      accountId: Schema.NullOr(Schema.String),
      machines: Schema.NullOr(Schema.Array(MachineRecord)),
      fetched: Schema.Boolean,
    },
    Read: { device: DeviceState.Device },
    Remembered: {},
    OpenSession: { projectId: Schema.String, sessionId: Schema.String },
    OpenProject: { projectId: Schema.String },
    /** Settings, from where the app is; null: back from Settings. */
    Settings: { from: Schema.NullOr(Back) },
    Unsettle: { sessionId: Schema.String },
    Unsettled: { sessionId: Schema.String },
    Refused,
  }),
});

const ReplicasLive = Replicas.child([AiLive]);

/** This device remembers the Machine as the Account's last. */
const remember = Command.make('RememberMachine', {
  args: Schema.Struct({ accountId: Schema.String, machineId: Schema.String }),
  run: ({ accountId, machineId }) =>
    DeviceState.setLastMachine(accountId, machineId).pipe(
      Effect.as({ _tag: 'Remembered' as const }),
    ),
});

export const MachineLive = Page.build(Machine, {
  init: () => ({
    model: {
      machines: null,
      fetched: false,
      device: null,
      remembered: false,
      back: null,
      unsettling: null,
    },
  }),
  pages: { Home: Home.Live, Project: Project.Live, Settings: Settings.Live },
  // 1. Provide
  provides: (self) =>
    Layer.unwrap(
      Effect.map(self.get, ({ props }) =>
        Layer.mergeAll(
          onMachine(props.params.machineId),
          Unsettled.layer((sessionId, problem) =>
            self.send(
              problem === null
                ? { _tag: 'Unsettled', sessionId }
                : { _tag: 'Refused', reason: problem },
            ),
          ),
        ),
      ),
    ),
  // 2. Hold
  children: {
    replicas: ReplicasLive,
    socket: { actor: Socket.Live },
    projects: { actor: Projects, props: () => ({}) },
    sessions: { actor: Sessions, props: () => ({}) },
    backgroundJobs: { actor: BackgroundJobs.Live },
    machineSwitcher: {
      actor: MachineSwitcher.Live,
      props: ({ model, props }) => ({
        machines: model.machines,
        on: props.params.machineId,
      }),
    },
    projectPicker: {
      actor: ProjectPicker.Live,
      props: ({ props }) => ({ machineId: props.params.machineId }),
    },
    sessionSwitcher: {
      actor: SessionSwitcher.Live,
      props: ({ props }) => ({ machineId: props.params.machineId }),
    },
    sessionActions: {
      actor: SessionActions.Live,
      props: ({ model, props }) => ({
        bindings: model.device?.bindings ?? {},
        machineId: props.params.machineId,
      }),
    },
    unsettler: {
      actor: UnsettlerLive,
      while: ({ model }) =>
        model.unsettling !== null && model.unsettling.problem === null,
      key: ({ model }) => model.unsettling?.sessionId ?? '',
      input: ({ model }) => ({ sessionId: model.unsettling?.sessionId ?? '' }),
    },
  },
  // 3. Know
  workers: {
    known: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          Stream.runForEach(state, ({ accountId, machines, fetchedAt }) =>
            self.send({
              _tag: 'Known',
              accountId,
              machines,
              fetched: fetchedAt !== null,
            }),
          ),
        ),
    },
    device: {
      run: (self) =>
        Stream.runForEach(
          Stream.concat(Stream.make(undefined), DeviceState.changes),
          () =>
            Effect.flatMap(DeviceState.read, (device) =>
              self.send({ _tag: 'Read', device }),
            ),
        ),
    },
  },
  on: {
    Known: ({ accountId, machines, fetched }, { model, props }) => {
      const { machineId } = props.params;
      const listed = machines?.some(({ id }) => id === machineId) === true;
      return {
        model: { ...model, machines, fetched },
        ...(listed && accountId !== null && !model.remembered
          ? { command: remember({ accountId, machineId }) }
          : {}),
      };
    },
    Remembered: (_, { model }) => ({ model: { ...model, remembered: true } }),
    Read: ({ device }, { model }) => ({ model: { ...model, device } }),
    OpenSession: ({ projectId, sessionId }, { props }) => ({
      command: Router.push(
        session(props.params.machineId, projectId, sessionId),
      ),
    }),
    OpenProject: ({ projectId }, { props }) => ({
      command: Router.push(project(props.params.machineId, projectId)),
    }),
    Settings: ({ from }, { model, props }) => {
      const { machineId } = props.params;
      if (from !== null)
        return {
          model: { ...model, back: from },
          command: Router.push(settings(machineId)),
        };
      const { projectId, sessionId } = model.back ?? {
        projectId: null,
        sessionId: null,
      };
      return {
        model: { ...model, back: null },
        command: Router.push(
          projectId === null
            ? home(machineId)
            : sessionId === null
              ? project(machineId, projectId)
              : session(machineId, projectId, sessionId),
        ),
      };
    },
    Unsettle: ({ sessionId }, { model }) =>
      model.unsettling !== null && model.unsettling.problem === null
        ? {}
        : { model: { ...model, unsettling: { sessionId, problem: null } } },
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
