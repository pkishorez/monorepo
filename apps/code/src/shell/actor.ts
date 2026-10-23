import { Effect, Layer, Schema, Stream } from 'effect';
import { AiLive } from '@kestack/ai-toolkit/client';
import { Machine as MachineRecord } from '@kestack/ai-toolkit/machines';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Replicas, Store } from '@kestack/std-toolkit/replica';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/account-switcher';
import {
  home,
  placeOf,
  project,
  session,
  settings,
  type Route,
} from '../places/index.ts';
import { Refused } from '../refusal/index.ts';
import { across, Projects, Sessions } from '../replica/index.ts';
import * as BackgroundJobs from './background-jobs/index.ts';
import * as Connections from './connection/index.ts';
import { DeviceState } from './device-state/index.ts';
import * as Dictation from './dictation/index.ts';
import * as Home from './home/index.ts';
import * as Machine from './machine/index.ts';
import * as MachineList from './machines/index.ts';
import * as MicrophonePicker from './microphone-picker/index.ts';
import * as ProjectPicker from './project-picker/index.ts';
import * as SessionActions from './session-actions/index.ts';
import * as SessionSwitcher from './session-switcher/index.ts';
import * as Settings from './settings/index.ts';
import { Unsettled, UnsettlerLive } from './unsettle.ts';

/*
 * The root page, drawn only in the browser: the app, on every Machine of
 * the Account signed in at once. It is one chain, each link started by the
 * one before:
 *
 * 1. Device State  `Reading` reads what this browser keeps, its Bindings,
 *                  its microphone and its Unseen marks, before anything
 *                  is drawn; `Ready` follows every write.
 * 2. Accounts      who is signed in, from auth-toolkit's `Accounts`, and
 *                  the Account Switcher. Signed out, only signing in is
 *                  drawn. An Account signed out of this device takes the
 *                  records of its Machines with it.
 * 3. Machines      the Machine List of the Account signed in: its Machines,
 *                  shared with every page as `Machines`, and how each is
 *                  reached: an `Ai` Instance and a socket per Machine.
 * 4. Hold          every Machine's projects and sessions, through Queries
 *                  that hold every listed Machine's Instance, so adding a
 *                  Machine opens one and forgetting it lets it go; each
 *                  Machine's socket; every session's Background Jobs;
 *                  the four Pickers the app's keys open anywhere: the
 *                  Project Picker, the Session Switcher, Session Actions
 *                  and the Microphone Picker; and the Dictation, which
 *                  carries on wherever the app goes, recording from the
 *                  microphone Device State names, its text going to the
 *                  Draft open when it stops, and hears every ask for it
 *                  through `Dictations`.
 * 5. Pages         home, Settings, and what is on one Machine,
 *                  `/m/:machineId`: a project and its sessions.
 *
 * It also opens a session the keyboard steps to, a new session in the
 * project open, and Settings, remembering where it was opened from, so the
 * same key goes back there; and Un-settles a session from the sidebar's
 * Settled List, one at a time, keeping why if its Machine refuses.
 */

/** Who is signed in, as the root keeps it. */
const Signed = Schema.TaggedUnion({
  Checking: {},
  SignedOut: {},
  SignedIn: {
    id: Schema.String,
    email: Schema.String,
    /** Every Account signed in on this device, by id. */
    accounts: Schema.Array(Schema.String),
  },
});
type Signed = typeof Signed.Type;

/** What the root knows of the Account's Machines, as `Machines` says it. */
const Known = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  /** The list, saved or fetched; null before either. */
  machines: Schema.NullOr(Schema.Array(MachineRecord)),
  /** Why the Backend could not be asked, until it can. */
  problem: Schema.NullOr(Schema.String),
});

/** Where Settings were opened from: a project, a session in it, or home. */
const Back = Schema.NullOr(
  Schema.Struct({
    machineId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
  }),
);

const Model = Schema.Struct({
  account: Signed,
  /** Why signing in failed, until it is tried again. */
  signInProblem: Schema.NullOr(Schema.String),
  known: Known,
  /** Where Settings were opened from, while they are open. */
  back: Back,
  /** The Session being Un-settled, and why its Machine refused, if it did. */
  unsettling: Schema.NullOr(
    Schema.Struct({
      machineId: Schema.String,
      sessionId: Schema.String,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
});
type Model = typeof Model.Type;

export const Shell = Page.define({
  render: 'client',
  requires: [
    Navigation,
    DeviceState.Store,
    Accounts,
    Store,
    MachineList.Saved,
    MachineList.Machines,
    Dictation.Dictations,
  ],
  metadata: { title: 'code' },
  pages: { Home: Home.Page, Settings: Settings.Page, Machine: Machine.Page },
  model: Model,
  state: Schema.TaggedUnion({
    Reading: {},
    Ready: { device: DeviceState.Device },
  }),
  message: Schema.TaggedUnion({
    Read: { device: DeviceState.Device },
    Signed: { account: Signed },
    SignIn: {},
    SignInFailed: { problem: Schema.String },
    Known: Known.fields,
    OpenSession: {
      machineId: Schema.String,
      projectId: Schema.String,
      sessionId: Schema.String,
    },
    OpenProject: { machineId: Schema.String, projectId: Schema.String },
    /** Settings, from where the app is; `back`: back from Settings. */
    Settings: { from: Back, back: Schema.Boolean },
    Unsettle: { machineId: Schema.String, sessionId: Schema.String },
    Unsettled: { sessionId: Schema.String },
    Refused,
    /** Space, Ctrl+Space, the mic button, or a Draft: for the Dictation. */
    Dictate: { ask: Dictation.Ask },
  }),
});

const ready = (device: typeof DeviceState.Device.Type) => ({
  state: { _tag: 'Ready' as const, device },
});

const signIn = Command.make('SignIn', {
  run: () =>
    Effect.flatMap(Accounts, (accounts) => accounts.signIn()).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'SignInFailed' as const,
          problem: error.message,
        }),
      ),
    ),
});

/** auth-toolkit's state, as the root keeps it. */
const signedOf = Accounts.pipe(
  Effect.map(({ state }) =>
    Stream.map(state, (now): Signed =>
      now._tag === 'SignedIn'
        ? {
            _tag: 'SignedIn',
            id: now.active.id,
            email: now.active.email,
            accounts: now.accounts.map(({ id }) => id),
          }
        : now._tag === 'SignedOut'
          ? { _tag: 'SignedOut' }
          : { _tag: 'Checking' },
    ),
  ),
  Stream.unwrap,
);

const idOf = (account: Signed) =>
  account._tag === 'SignedIn' ? account.id : null;

/** The Accounts signed out of this device between two states. */
const goneFrom = (before: Signed, after: Signed) =>
  before._tag !== 'SignedIn'
    ? []
    : after._tag === 'Checking'
      ? []
      : before.accounts.filter(
          (id) => after._tag !== 'SignedIn' || !after.accounts.includes(id),
        );

/**
 * The Machines the app is on: the list of the Account signed in, and no
 * other Account's, so another Account signing in lets go of every
 * Instance at once.
 */
export const machineIdsOf = ({ account, known }: Model) =>
  idOf(account) !== null && known.accountId === idOf(account)
    ? (known.machines ?? []).map(({ id }) => id)
    : [];

/** The listed Machines of the Account signed in, by id, with their names. */
const listedOf = (model: Model) => {
  const ids = new Set(machineIdsOf(model));
  return (model.known.machines ?? [])
    .filter(({ id }) => ids.has(id))
    .map(({ id, name }) => ({ id, name }));
};

/** The Draft open at `route`, a new session's or a Session's, if any. */
const draftAt = (route: Route | undefined) => {
  const place = route === undefined ? null : placeOf(route);
  return place?._tag === 'Project'
    ? {
        machineId: place.machineId,
        projectId: place.projectId,
        sessionId: place.page?.sessionId ?? null,
      }
    : null;
};

export const ShellLive = Page.build(Shell, {
  init: () => ({
    model: {
      account: { _tag: 'Checking' },
      signInProblem: null,
      known: { accountId: null, machines: null, problem: null },
      back: null,
      unsettling: null,
    },
    state: { _tag: 'Reading' },
  }),
  pages: {
    Home: Home.Live,
    Settings: Settings.Live,
    Machine: Machine.Live,
  },
  // At the top, as the pages are: the Account, and how each Machine is
  // reached, are shared from here.
  provides: (self) =>
    Layer.mergeAll(
      CurrentAccount.layer,
      MachineList.reach,
      Unsettled.layer((sessionId, problem) =>
        self.send(
          problem === null
            ? { _tag: 'Unsettled', sessionId }
            : { _tag: 'Refused', reason: problem },
        ),
      ),
    ),
  children: {
    // The Auth Worker's `maxAccounts`: its default, 5.
    account: { actor: AccountSwitcherLive, input: () => ({ maxAccounts: 5 }) },
    replicas: Replicas.child([AiLive]),
  },
  workers: {
    // 2. Accounts
    accounts: {
      run: (self) =>
        Stream.runForEach(signedOf, (account) =>
          self.send({ _tag: 'Signed', account }),
        ),
    },
    // 3. Machines, as the Machine List says them.
    known: {
      run: (self) =>
        Effect.flatMap(MachineList.Machines, ({ state }) =>
          Stream.runForEach(state, ({ accountId, machines, problem }) =>
            self.send({ _tag: 'Known', accountId, machines, problem }),
          ),
        ),
    },
  },
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
    Ready: {
      children: {
        // 3. Machines, one Machine List per Account signed in.
        machines: {
          actor: MachineList.Live,
          while: ({ model }) => model.account._tag === 'SignedIn',
          key: ({ model }) => idOf(model.account) ?? '',
          input: ({ model }) => ({ accountId: idOf(model.account) ?? '' }),
          props: ({ model }) => ({
            email:
              model.account._tag === 'SignedIn' ? model.account.email : null,
          }),
        },
        // 4. Hold
        projects: {
          actor: Projects,
          each: ({ model }) => across.each(machineIdsOf(model)),
          props: (_, key) => across.props(key),
        },
        sessions: {
          actor: Sessions,
          each: ({ model }) => across.each(machineIdsOf(model)),
          props: (_, key) => across.props(key),
        },
        connections: {
          actor: Connections.Live,
          props: ({ model }) => ({ machineIds: machineIdsOf(model) }),
        },
        backgroundJobs: {
          actor: BackgroundJobs.Live,
          props: ({ model }) => ({ machineIds: machineIdsOf(model) }),
        },
        projectPicker: {
          actor: ProjectPicker.Live,
          props: ({ model }) => ({ machines: listedOf(model) }),
        },
        sessionSwitcher: {
          actor: SessionSwitcher.Live,
          props: ({ model }) => ({ machines: listedOf(model) }),
        },
        sessionActions: {
          actor: SessionActions.Live,
          props: ({ state }) => ({ bindings: state.device.bindings }),
        },
        microphonePicker: {
          actor: MicrophonePicker.Live,
          props: ({ state }) => ({ chosen: state.device.microphone }),
        },
        dictation: {
          actor: Dictation.Live,
          props: ({ model, props, state }) => ({
            machineIds: machineIdsOf(model),
            microphone: state.device.microphone,
            place: draftAt(props.route.page),
          }),
        },
        unsettler: {
          actor: UnsettlerLive,
          while: ({ model }) =>
            model.unsettling !== null && model.unsettling.problem === null,
          key: ({ model }) => model.unsettling?.sessionId ?? '',
          input: ({ model }) => ({
            machineId: model.unsettling?.machineId ?? '',
            sessionId: model.unsettling?.sessionId ?? '',
          }),
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
      },
      on: {
        Read: ({ device }) => ready(device),
      },
    },
  },
  on: {
    Signed: ({ account }, { model }) => {
      const gone = goneFrom(model.account, account);
      return {
        model: { ...model, account },
        ...(gone.length > 0
          ? { command: MachineList.signedOut({ accountIds: gone }) }
          : {}),
      };
    },
    SignIn: (_, { model }) => ({
      model: { ...model, signInProblem: null },
      command: signIn(),
    }),
    SignInFailed: ({ problem }, { model }) => ({
      model: { ...model, signInProblem: problem },
    }),
    Known: ({ _tag, ...known }, { model }) => ({ model: { ...model, known } }),
    OpenSession: ({ machineId, projectId, sessionId }) => ({
      command: Router.push(session(machineId, projectId, sessionId)),
    }),
    OpenProject: ({ machineId, projectId }) => ({
      command: Router.push(project(machineId, projectId)),
    }),
    Settings: ({ from, back }, { model }) => {
      if (!back)
        return {
          model: { ...model, back: from },
          command: Router.push(settings()),
        };
      const to = model.back;
      return {
        model: { ...model, back: null },
        command: Router.push(
          to === null
            ? home()
            : to.sessionId === null
              ? project(to.machineId, to.projectId)
              : session(to.machineId, to.projectId, to.sessionId),
        ),
      };
    },
    Unsettle: ({ machineId, sessionId }, { model }) =>
      model.unsettling !== null && model.unsettling.problem === null
        ? {}
        : {
            model: {
              ...model,
              unsettling: { machineId, sessionId, problem: null },
            },
          },
    Unsettled: ({ sessionId }, { model }) =>
      model.unsettling?.sessionId === sessionId
        ? { model: { ...model, unsettling: null } }
        : {},
    Dictate: ({ ask }) => ({ command: Dictation.ask(ask) }),
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
