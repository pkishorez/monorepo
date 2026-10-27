import { Layer, Schema, Stream } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/recipes/account-switcher';
import {
  draw,
  kept,
  pruneAccounts,
  ready,
  running,
  Shown,
  shownOf,
  Signed,
  signed,
  signIn,
} from './account/index.ts';
import { Machines as MachinesActor } from './account/machines/index.ts';
import { machinesLayer, Prepared } from './account/machines/machines.ts';
import { machineFilterIdb } from './account/machines/store.ts';
import { moves, reach } from './account/machines/machine/index.ts';
import {
  cacheIdb,
  savedDraftsIdb,
  seenIdb,
  syncIdb,
} from './account/machines/machine/store/index.ts';
import { dictations, recorder } from './account/machines/voice/index.ts';
import { Layout } from './account/machines/layout/index.ts';
import { Home } from './account/machines/layout/pages/home/index.ts';
import { Project } from './account/machines/layout/pages/project/index.ts';
import { Settings } from './account/machines/layout/pages/settings/index.ts';
import { Storage } from './account/store/index.ts';
import { Kabuki } from './kabuki/index.ts';
import { home, type Route } from './routes/index.ts';
import { nothing, Preferences } from './store.ts';

/*
 * The Device: the root page, drawn only in the browser, the app on every
 * Machine of the Account signed in at once. It opens first, reads this
 * device's database, `code:device` (`store.ts`): the Preferences, and the
 * Accounts signed in here. Its States are the Account step.
 *
 * 1. Account   who is signed in, from auth-toolkit's `Accounts`, and the
 *              Account Switcher, always (`account/`): `Reading` until
 *              this device's Accounts are read, drawing only the mark;
 *              while it is `Checking`, everything is drawn as the Account
 *              last signed in here, if there is one; `SignedOut`, only
 *              signing in is drawn; `SignedIn`, the app. Another Account
 *              than the one drawn stays off screen until its Machines are
 *              ready, the one drawn staying, then is drawn, home, in one
 *              step. Once the Auth Worker has really answered, every
 *              Account not signed in here is deleted, with all its
 *              databases (`Storage`).
 * 2. Machines  the Machines of the Account drawn, one per Account, and of
 *              the one about to be, preparing (`account/machines/`): each
 *              listed Machine runs under it with its own database and sync
 *              Store. What the Machines keep and publish, how each is
 *              reached and the Moves on their way to them, the Dictation's
 *              asks and the microphone, are Provided from here to
 *              everything below, pages too, since a page is a Child of
 *              this page and of no Machine.
 * 3. Layout    what is drawn around every page, keyed by the Account
 *              drawn: the keys, the sidebar, the header and the Pickers,
 *              told where the app is (`account/machines/layout/`). Its
 *              keyboard is read here first, from the Preferences, and
 *              followed, so it draws at once.
 * 4. Pages     home, Settings, and a project of one Machine,
 *              `/m/:machineId/p/:projectId`, and its sessions, drawn
 *              inside Layout; and `/kabuki`, the app's own Actor tree.
 *
 * The Account, its Machines and Layout are Children, not pathless pages:
 * the Machines of two Accounts run at once while one prepares, Layout is
 * made again for each Account drawn, and an address that names no page is
 * still drawn inside Layout, none of which a page under the URL can do.
 */

const Model = Schema.Struct({
  /** Why signing in failed, until it is tried again. */
  signInProblem: Schema.NullOr(Schema.String),
  /** The Account the app is drawn for; another wanted waits until it is ready. */
  drawn: Schema.NullOr(Shown),
  /** Layout's keyboard, from Preferences; null until read. */
  keyboard: Schema.NullOr(Layout.Keys),
});

export const Device = Page.define({
  render: 'client',
  requires: [Navigation, Preferences, Accounts, Storage],
  metadata: { title: 'code' },
  pages: {
    Home: Home.page,
    Settings: Settings.page,
    Project: Project.page,
    Kabuki: Kabuki.page,
  },
  model: Model,
  state: Signed,
  message: Schema.TaggedUnion({
    Signed: { account: Signed },
    KeyboardRead: { keyboard: Layout.Keys },
    /** The Machines of `accountId` have read their kept list. */
    Prepared: { accountId: Schema.String },
    SignInAsked: {},
    SignInFailed: { problem: Schema.String },
  }),
});

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

export const DeviceLive = Page.build(Device, {
  init: () => ({
    model: { signInProblem: null, drawn: null, keyboard: null },
    state: { _tag: 'Reading' },
  }),
  pages: {
    Home: Home.actor,
    Settings: Settings.actor,
    Project: Project.actor,
    Kabuki: Kabuki.actor,
  },
  // 2. Machines, at the top, as the pages are: the Account; what the
  // Machines keep, in each one's database and its Account's, and publish;
  // how each Machine is reached, and the Moves on their way to them; the
  // Dictation's asks and the microphone.
  // 1. Account: the Machines preparing say when they are ready.
  provides: (self) =>
    Layer.mergeAll(
      CurrentAccount.layer,
      moves.pipe(Layer.provideMerge(reach), Layer.provideMerge(machinesLayer)),
      syncIdb,
      cacheIdb,
      seenIdb,
      savedDraftsIdb,
      machineFilterIdb,
      dictations,
      recorder,
      Layer.succeed(Prepared, {
        ready: (accountId) => self.send({ _tag: 'Prepared', accountId }),
      }),
    ),
  children: {
    // 1. Account. The Auth Worker's `maxAccounts`: its default, 5.
    account: { actor: AccountSwitcherLive, input: () => ({ maxAccounts: 5 }) },
    // 2. Machines: of the Account drawn, and of the one wanted while it
    // prepares, kept as the Account checked turns out to be the same.
    machines: {
      actor: MachinesActor.actor,
      each: ({ state, model }) =>
        running(model.drawn, shownOf(state)).map(({ id }) => id),
      input: (_, accountId) => ({ accountId }),
      props: ({ state, model }, accountId) => ({
        email:
          running(model.drawn, shownOf(state)).find(
            ({ id }) => id === accountId,
          )?.email ?? null,
        drawn: model.drawn?.id === accountId,
      }),
    },
    // 3. Layout: one per Account drawn, once its keyboard is read.
    layout: {
      actor: Layout.actor,
      while: ({ model }) => model.drawn !== null && model.keyboard !== null,
      key: ({ model }) => model.drawn?.id ?? '',
      input: ({ model }) => ({
        keyboard: model.keyboard ?? Layout.keysOf(nothing),
      }),
      props: ({ model, props }) => ({
        accountId: model.drawn?.id ?? '',
        email: model.drawn?.email ?? '',
        place: draftAt(props.route.page),
      }),
    },
  },
  workers: {
    // 1. Account
    accounts: {
      run: (self) =>
        Stream.runForEach(signed, (account) =>
          self.send({ _tag: 'Signed', account }),
        ),
    },
    // 3. Layout
    keyboard: {
      run: (self) =>
        Stream.runForEach(Layout.keyboard, (keyboard) =>
          self.send({ _tag: 'KeyboardRead', keyboard }),
        ),
    },
  },
  on: {
    Signed: ({ account }, { model, state }) => {
      // Answered at last, or one fewer signed in: only theirs are kept.
      // Another Account than the one drawn waits until it is ready.
      const keep = kept(state, account);
      const now = draw(model.drawn, shownOf(account));
      return {
        state: account,
        model: { ...model, drawn: now.drawn },
        command: [
          ...(keep !== null ? [pruneAccounts({ accountIds: keep })] : []),
          ...(now.home ? [Router.replace(home())] : []),
        ],
      };
    },
    KeyboardRead: ({ keyboard }, { model }) => ({
      model: { ...model, keyboard },
    }),
    // Ready: drawn, home, in place of the page, so nothing of the last
    // Account's stays on screen and Back does not return to it.
    Prepared: ({ accountId }, { model, state }) => {
      const now = ready(model.drawn, shownOf(state), accountId);
      return {
        model: { ...model, drawn: now.drawn },
        command: now.home ? [Router.replace(home())] : [],
      };
    },
    SignInAsked: (_, { model }) => ({
      model: { ...model, signInProblem: null },
      command: signIn(),
    }),
    SignInFailed: ({ problem }, { model }) => ({
      model: { ...model, signInProblem: problem },
    }),
  },
});
