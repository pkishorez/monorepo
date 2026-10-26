import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeReplicaLive } from '@kestack/connect/code';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Replicas, Store } from '@kestack/std-toolkit/replica';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/recipes/account-switcher';
import {
  AccountReplicas,
  Ask,
  DeviceState,
  Dictations,
  Kept,
  Machines,
  SavedDrafts,
} from '../layer/capabilities/index.ts';
import {
  home,
  project,
  session,
  settings,
  type Route,
} from './routes/index.ts';
import { Dictation } from './actors/dictation/index.ts';
import { Header } from './actors/header/index.ts';
import { MachineList, reach } from './machines/index.ts';
import { KeysPicker } from './actors/pickers/keys-picker/index.ts';
import { MicrophonePicker } from './actors/pickers/microphone-picker/index.ts';
import { ProjectPicker } from './actors/pickers/project-picker/index.ts';
import { SessionActions } from './actors/pickers/session-actions/index.ts';
import { SessionSwitcher } from './actors/pickers/session-switcher/index.ts';
import { Sidebar } from './actors/sidebar/index.ts';
import { askDictation, keepAccounts, setVim, signIn } from './commands.ts';
import { Home } from './pages/home/index.ts';
import { Project } from './pages/project/index.ts';
import { Settings } from './pages/settings/index.ts';
import { layer as moves } from './actors/moves/index.ts';

/*
 * The root page, drawn only in the browser: the app, on every Machine of
 * the Account signed in at once. It keeps only who is signed in, the keys,
 * and where Settings were opened from; each Child reads the rest for
 * itself, so a change to one draws only what shows it.
 *
 * 1. Keys      `Reading` reads the keyboard from Device State, the user's
 *              Bindings and whether Vim Mode is on, before anything is
 *              drawn; `Ready` follows them as they change, and nothing else
 *              of Device State. Vim Mode turned on or off shows at once,
 *              and is kept.
 * 2. Accounts  who is signed in, from auth-toolkit's `Accounts`, and the
 *              Account Switcher. Signed out, only signing in is drawn. Once
 *              Accounts are signed in, and each time one is signed out of
 *              this device, only their records are kept.
 * 3. Reach     every listed Machine's Replicas and socket, Provided to
 *              everything below; the Machine List of the Account signed in
 *              says which Machines those are, through `Machines`.
 * 4. Children  the sidebar, the header, the five Pickers the app's keys
 *              open anywhere, and the Dictation, which carries on wherever
 *              the app goes; each told only where the app is.
 * 5. Pages     home, Settings, and a project of one Machine,
 *              `/m/:machineId/p/:projectId`, and its sessions.
 *
 * It also starts a new session in the project open, opens Settings,
 * remembering where it was opened from, so the same key goes back there,
 * goes Back and Forward through the pages, and goes home when another
 * Account, or none, is signed in.
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

/** Where Settings were opened from: a project, a session in it, or home. */
const Back = Schema.NullOr(
  Schema.Struct({
    machineId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
  }),
);

/** The keyboard as this browser keeps it: the Bindings, and Vim Mode. */
const Keys = Schema.Struct({
  bindings: DeviceState.Device.fields.bindings,
  vim: Schema.Boolean,
});
const sameKeys = Schema.toEquivalence(Keys);

const Model = Schema.Struct({
  account: Signed,
  /** Why signing in failed, until it is tried again. */
  signInProblem: Schema.NullOr(Schema.String),
  /** Where Settings were opened from, while they are open. */
  back: Back,
});

export const Shell = Page.define({
  render: 'client',
  requires: [
    Navigation,
    DeviceState,
    Accounts,
    Store,
    Kept,
    SavedDrafts,
    AccountReplicas,
    Machines,
    Dictations,
  ],
  metadata: { title: 'code' },
  pages: { Home: Home.page, Settings: Settings.page, Project: Project.page },
  model: Model,
  state: Schema.TaggedUnion({
    Reading: {},
    Ready: { keyboard: Keys },
  }),
  message: Schema.TaggedUnion({
    KeyboardRead: { keyboard: Keys },
    /** Vim Mode turned on or off, by its keys or in Settings. */
    VimChanged: { on: Schema.Boolean },
    Signed: { account: Signed },
    SignInAsked: {},
    SignInFailed: { problem: Schema.String },
    /** A new session in the project open. */
    NewSessionAsked: { machineId: Schema.String, projectId: Schema.String },
    /** Settings, from where the app is; `back`: back from Settings. */
    SettingsToggled: { from: Back, back: Schema.Boolean },
    /** Space, Ctrl+Space, the mic button, or a Draft: for the Dictation. */
    DictationAsked: { ask: Ask },
    /** Ctrl+O and Ctrl+I: Back and Forward through the pages. */
    BackAsked: {},
    ForwardAsked: {},
  }),
});

const ready = (keyboard: typeof Keys.Type) => ({
  state: { _tag: 'Ready' as const, keyboard },
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

/** The Draft open at `route`, a new session's or a Session's, if any. */
const draftAt = (route: Route | undefined) => {
  const place = route ?? null;
  return place?._tag === 'Project'
    ? {
        machineId: place.machineId,
        projectId: place.projectId,
        sessionId: place.page?.sessionId ?? null,
      }
    : null;
};

/** The keyboard, now and after each change to it, here or in another tab. */
const keyboard = Stream.concat(
  Stream.make(undefined),
  DeviceState.changes,
).pipe(
  Stream.mapEffect(() =>
    Effect.map(DeviceState.read, ({ bindings, vim }) => ({ bindings, vim })),
  ),
  Stream.changesWith(sameKeys),
);

export const ShellLive = Page.build(Shell, {
  init: () => ({
    model: { account: { _tag: 'Checking' }, signInProblem: null, back: null },
    state: { _tag: 'Reading' },
  }),
  pages: {
    Home: Home.actor,
    Settings: Settings.actor,
    Project: Project.actor,
  },
  // At the top, as the pages are: the Account, how each Machine is
  // reached, and the Moves on their way to them, are shared from here.
  provides: () =>
    Layer.mergeAll(CurrentAccount.layer, moves.pipe(Layer.provideMerge(reach))),
  children: {
    // The Auth Worker's `maxAccounts`: its default, 5.
    account: { actor: AccountSwitcherLive, input: () => ({ maxAccounts: 5 }) },
    replicas: Replicas.child([CodeReplicaLive]),
  },
  workers: {
    // 2. Accounts
    accounts: {
      run: (self) =>
        Stream.runForEach(signedOf, (account) =>
          self.send({ _tag: 'Signed', account }),
        ),
    },
  },
  state: {
    // 1. Keys
    Reading: {
      workers: {
        read: {
          run: (self) =>
            Effect.flatMap(DeviceState.read, ({ bindings, vim }) =>
              self.send({ _tag: 'KeyboardRead', keyboard: { bindings, vim } }),
            ),
        },
      },
      on: { KeyboardRead: ({ keyboard }) => ready(keyboard) },
    },
    Ready: {
      children: {
        // 3. Reach: one Machine List per Account signed in.
        machines: {
          actor: MachineList.actor,
          while: ({ model }) => model.account._tag === 'SignedIn',
          key: ({ model }) => idOf(model.account) ?? '',
          input: ({ model }) => ({ accountId: idOf(model.account) ?? '' }),
          props: ({ model }) => ({
            email:
              model.account._tag === 'SignedIn' ? model.account.email : null,
          }),
        },
        // 4. Children
        sidebar: { actor: Sidebar.actor },
        header: {
          actor: Header.actor,
          props: ({ props }) => ({ place: draftAt(props.route.page) }),
        },
        projectPicker: { actor: ProjectPicker.actor },
        sessionSwitcher: { actor: SessionSwitcher.actor },
        sessionActions: {
          actor: SessionActions.actor,
          props: ({ state }) => ({ bindings: state.keyboard.bindings }),
        },
        microphonePicker: { actor: MicrophonePicker.actor },
        keysPicker: {
          actor: KeysPicker.actor,
          props: ({ state }) => ({ bindings: state.keyboard.bindings }),
        },
        dictation: {
          actor: Dictation.actor,
          props: ({ props }) => ({ place: draftAt(props.route.page) }),
        },
      },
      workers: {
        // A change here or in another tab is read again.
        keyboard: {
          run: (self) =>
            Stream.runForEach(keyboard, (keyboard) =>
              self.send({ _tag: 'KeyboardRead', keyboard }),
            ),
        },
      },
      on: {
        KeyboardRead: ({ keyboard }, { state }) =>
          sameKeys(keyboard, state.keyboard) ? {} : ready(keyboard),
        // Shown at once, and kept.
        VimChanged: ({ on }, { state }) => ({
          ...ready({ ...state.keyboard, vim: on }),
          command: setVim({ on }),
        }),
      },
    },
  },
  on: {
    Signed: ({ account }, { model }) => {
      const gone = goneFrom(model.account, account);
      // Signed in at last, or one fewer: only their records are kept. A
      // state signed out deletes nothing, since Accounts may still be
      // kept on this device with none active; the next one signed in does.
      const keep =
        account._tag === 'SignedIn' &&
        (model.account._tag !== 'SignedIn' || gone.length > 0);
      // Another Account, or none: home, in place of the page, so nothing of
      // the last Account's stays on screen and Back does not return to it.
      const switched =
        model.account._tag === 'SignedIn' &&
        account._tag !== 'Checking' &&
        idOf(account) !== model.account.id;
      return {
        model: { ...model, account, back: switched ? null : model.back },
        command: [
          ...(keep ? [keepAccounts({ accountIds: account.accounts })] : []),
          ...(switched ? [Router.replace(home())] : []),
        ],
      };
    },
    SignInAsked: (_, { model }) => ({
      model: { ...model, signInProblem: null },
      command: signIn(),
    }),
    SignInFailed: ({ problem }, { model }) => ({
      model: { ...model, signInProblem: problem },
    }),
    NewSessionAsked: ({ machineId, projectId }) => ({
      command: Router.push(project(machineId, projectId)),
    }),
    SettingsToggled: ({ from, back }, { model }) => {
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
    DictationAsked: ({ ask }) => ({ command: askDictation(ask) }),
    BackAsked: () => ({ command: Router.back() }),
    ForwardAsked: () => ({ command: Router.forward() }),
  },
});
