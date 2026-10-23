import { Effect, Layer, Schema, Stream } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Store } from '@kestack/std-toolkit/replica';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/account-switcher';
import { root } from '../places/index.ts';
import { DeviceState } from './device-state/index.ts';
import * as Machine from './machine/index.ts';
import * as MachineList from './machines/index.ts';

/*
 * The root page, drawn only in the browser. The app is one chain, each link
 * started by the one before:
 *
 * 1. Device State  `Reading` reads what this browser keeps, its Bindings,
 *                  Vim Mode, Unseen marks and each Account's last Machine,
 *                  before anything is drawn; `Ready` follows every write.
 * 2. Accounts      who is signed in, from auth-toolkit's `Accounts`, and
 *                  the Account Switcher. Signed out, only signing in is
 *                  drawn. An Account signed out of this device takes the
 *                  records of its Machines with it, the open one's once
 *                  its page has closed.
 * 3. Machines      the Machine List of the Account signed in: its Machines,
 *                  shared with every page as `Machines`. At the root it
 *                  opens the Machine last used here, else the one seen last.
 * 4. Machine       the Machine page, `/m/:machineId`, which Provides its own
 *                  socket and records to the pages under it. Another
 *                  Account, or none, goes back to the root, closing it.
 *
 * Kabuki keeps a page whatever the root's State, so the Machine page and
 * what it holds wait for what they need; the View draws it only once
 * signed in.
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

export const Shell = Page.define({
  render: 'client',
  requires: [
    Navigation,
    DeviceState.Store,
    Accounts,
    Store,
    MachineList.Saved,
    MachineList.Records,
  ],
  metadata: { title: 'code' },
  pages: { Open: MachineList.OpenPage, Machine: Machine.Page },
  model: Schema.Struct({
    account: Signed,
    /** Why signing in failed, until it is tried again. */
    signInProblem: Schema.NullOr(Schema.String),
  }),
  state: Schema.TaggedUnion({
    Reading: {},
    Ready: { device: DeviceState.Device },
  }),
  message: Schema.TaggedUnion({
    Read: { device: DeviceState.Device },
    SetVim: { on: Schema.Boolean },
    Signed: { account: Signed },
    SignIn: {},
    SignInFailed: { problem: Schema.String },
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

export const ShellLive = Page.build(Shell, {
  init: () => ({
    model: { account: { _tag: 'Checking' }, signInProblem: null },
    state: { _tag: 'Reading' },
  }),
  pages: { Open: MachineList.OpenLive, Machine: Machine.Live },
  // At the top, as the pages are: what they read of the Account and its
  // Machines is shared from here.
  provides: () =>
    Layer.mergeAll(CurrentAccount.layer, MachineList.Machines.layer),
  children: {
    // The Auth Worker's `maxAccounts`: its default, 5.
    account: { actor: AccountSwitcherLive, input: () => ({ maxAccounts: 5 }) },
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
      // 3. Machines, one Machine List per Account signed in.
      children: {
        machines: {
          actor: MachineList.Live,
          while: ({ model }) => model.account._tag === 'SignedIn',
          key: ({ model }) => idOf(model.account) ?? '',
          input: ({ model }) => ({ accountId: idOf(model.account) ?? '' }),
          props: ({ model, state, props }) => {
            const id = idOf(model.account) ?? '';
            const page = props.route.page;
            return {
              atRoot: page?._tag === 'Open',
              last: state.device.machines[id] ?? null,
              on: page?._tag === 'Machine' ? page.machineId : null,
              email:
                model.account._tag === 'SignedIn' ? model.account.email : null,
            };
          },
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
        // Shown at once; the write is heard and read back.
        SetVim: ({ on }, { state }) => ({
          ...ready({ ...state.device, vim: on }),
          command: DeviceState.setVim({ on }),
        }),
      },
    },
  },
  on: {
    Signed: ({ account }, { model, props }) => {
      const gone = goneFrom(model.account, account);
      // 4. Another Account, or none: the Machine open closes.
      const moved =
        model.account._tag === 'SignedIn' &&
        account._tag !== 'Checking' &&
        idOf(account) !== model.account.id &&
        props.route.page?._tag === 'Machine';
      return {
        model: { ...model, account },
        command: [
          ...(gone.length > 0
            ? [MachineList.signedOut({ accountIds: gone })]
            : []),
          ...(moved ? [Router.replace(root())] : []),
        ],
      };
    },
    SignIn: (_, { model }) => ({
      model: { ...model, signInProblem: null },
      command: signIn(),
    }),
    SignInFailed: ({ problem }, { model }) => ({
      model: { ...model, signInProblem: problem },
    }),
  },
});

export const router = Router.define(Shell, {
  notFound: { title: 'Not found · code', robots: 'noindex' },
});
