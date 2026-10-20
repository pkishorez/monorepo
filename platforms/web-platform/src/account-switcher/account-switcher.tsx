import {
  Context,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import type { ActorType } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import type { ViewOf } from '@kestack/kabuki/react';
import { Accounts } from '@kestack/auth-toolkit/client';

import { AccountMenu, Remembered, SignInButton, Slot } from './menu.tsx';
import {
  Model,
  SWITCH_DELAY,
  SWITCH_MINIMUM,
  Shown,
  changed,
  current,
  fromAccounts,
  idle,
  switchDone,
} from './model.ts';

/*
 * The Account Switcher: who is signed in to a Kabuki app in the browser,
 * as auth-toolkit's `Accounts` says, and the menu in the header to switch,
 * add and sign out. It is a Child of the root page, which draws its View in
 * the header, and Provides `CurrentAccount` to every page.
 *
 * 1. Follow   `Accounts.state` becomes `Changed`; a switch under way is
 *             timed (`model.ts`): it shows past 150 ms and stays 300 ms.
 * 2. Act      switching, adding and signing out are Messages, each one
 *             Command on `Accounts`; one at a time, the rest refused.
 * 3. Share    the root page Provides `CurrentAccount.layer`. A page reads
 *             who is signed in and the switch on screen from it, and asks
 *             for the same actions: what it asks comes to this Instance as
 *             its own Messages, and what it reads is this Instance's Model.
 */

type Current = ReturnType<typeof current>;

/** What a page may ask for, as the Messages it becomes. */
type Request =
  | { readonly _tag: 'SignIn' }
  | { readonly _tag: 'SwitchTo'; readonly id: string }
  | { readonly _tag: 'SignOut' }
  | { readonly _tag: 'SignOutAll' };

/** Between the root page's Provides and the Account Switcher under it: what it shows, and what pages ask of it. */
class Link extends Context.Service<
  Link,
  {
    readonly shown: SubscriptionRef.SubscriptionRef<Current>;
    readonly asked: Queue.Queue<Request>;
  }
>()('@kestack/web-platform/account-switcher/Link') {}

/**
 * Who is signed in to the app, for any page under the root: `state` is the
 * current one, then each change; `switching` is the Account a switch on
 * screen makes active, set only once the switch shows, while `account`
 * stays the one before until it ends. The rest are Requests to the Account
 * Switcher. The root page Provides `CurrentAccount.layer`.
 */
export class CurrentAccount extends Context.Service<
  CurrentAccount,
  {
    readonly state: Stream.Stream<Current>;
    readonly current: Effect.Effect<Current>;
    readonly signIn: Effect.Effect<void>;
    readonly switchTo: (id: string) => Effect.Effect<void>;
    readonly signOut: Effect.Effect<void>;
    readonly signOutAll: Effect.Effect<void>;
  }
>()('@kestack/web-platform/CurrentAccount') {
  static readonly layer: Layer.Layer<CurrentAccount | Link> =
    Layer.effectContext(
      Effect.gen(function* () {
        const shown = yield* SubscriptionRef.make<Current>({
          account: { _tag: 'Checking', last: null },
          switching: null,
        });
        const asked = yield* Queue.unbounded<Request>();
        const ask = (request: Request) =>
          Effect.asVoid(Queue.offer(asked, request));
        return Context.make(Link, { shown, asked }).pipe(
          Context.add(CurrentAccount, {
            state: SubscriptionRef.changes(shown),
            current: SubscriptionRef.get(shown),
            signIn: ask({ _tag: 'SignIn' }),
            switchTo: (id) => ask({ _tag: 'SwitchTo', id }),
            signOut: ask({ _tag: 'SignOut' }),
            signOutAll: ask({ _tag: 'SignOutAll' }),
          }),
        );
      }),
    );
}

/** An action's end as a Message: settled, or what failed and why. */
const settle =
  (what: string) =>
  <E extends { readonly message: string }>(action: Effect.Effect<void, E>) =>
    action.pipe(
      Effect.as({ _tag: 'Settled' as const }),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'Failed' as const,
          message: `${what} ${error.message}`,
        }),
      ),
    );

const signIn = Command.make('signIn', {
  run: () =>
    Effect.flatMap(Accounts, (a) => settle("Couldn't sign in.")(a.signIn())),
});

const switchTo = Command.make('switchTo', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(Accounts, (a) =>
      settle("Couldn't switch accounts.")(a.switchTo(id)),
    ),
});

const signOut = Command.make('signOut', {
  run: () =>
    Effect.flatMap(Accounts, (a) => settle("Couldn't sign out.")(a.signOut())),
});

const signOutAll = Command.make('signOutAll', {
  run: () =>
    Effect.flatMap(Accounts, (a) =>
      settle("Couldn't sign out of all accounts.")(a.signOutAll),
    ),
});

const Input = Schema.Struct({
  /** How many Accounts the Auth Worker holds for one browser: its `maxAccounts`, 5 unless set. */
  maxAccounts: Schema.Number,
});

const Message = Schema.TaggedUnion({
  SignIn: {},
  SwitchTo: { id: Schema.String },
  SignOut: {},
  SignOutAll: {},
  Changed: {
    account: Shown,
    /** The Account a switch under way makes active. */
    switchingTo: Schema.NullOr(Schema.String),
  },
  SwitchShown: {},
  SwitchDone: {},
  Settled: {},
  Failed: { message: Schema.String },
});

const AccountSwitcher = Actor.define('AccountSwitcher', {
  requires: [Accounts, Link],
  input: Input,
  model: Model,
  message: Message,
});

// Written out: the type `Actor.build` infers names Kabuki's internals.
export const AccountSwitcherLive: ActorType<
  'AccountSwitcher',
  typeof Input.Type,
  void,
  typeof Model.Type,
  { readonly _tag: 'Single' },
  typeof Message.Type,
  { readonly Single: {} },
  Accounts | Link
> = Actor.build(AccountSwitcher, {
  init: ({ maxAccounts }) => ({
    model: {
      account: { _tag: 'Checking', last: null },
      switching: null,
      busy: null,
      failed: null,
      maxAccounts,
    },
  }),
  workers: {
    accounts: {
      run: (self) =>
        Effect.flatMap(Accounts, ({ state }) =>
          Stream.runForEach(state, (now) =>
            self.send({ _tag: 'Changed', ...fromAccounts(now) }),
          ),
        ),
    },
    // What the pages read follows the Model.
    publish: {
      run: (self) =>
        Effect.flatMap(Link, ({ shown }) =>
          self.changes.pipe(
            Stream.map(({ model }) => current(model)),
            Stream.changes,
            Stream.runForEach((now) => SubscriptionRef.set(shown, now)),
          ),
        ),
    },
    // What the pages ask comes in as this Instance's own Messages.
    requests: {
      run: (self) =>
        Effect.flatMap(Link, ({ asked }) =>
          Stream.runForEach(Stream.fromQueue(asked), self.send),
        ),
    },
    // A switch still under way after the delay shows.
    showSwitch: {
      while: ({ model }) =>
        model.switching !== null &&
        model.switching.shownAt === null &&
        model.switching.next === null,
      run: (self) =>
        Effect.gen(function* () {
          const since = (yield* self.get).model.switching?.since ?? 0;
          yield* Effect.sleep(
            Math.max(0, since + SWITCH_DELAY - (yield* self.now)),
          );
          yield* self.send({ _tag: 'SwitchShown' });
        }),
    },
    // One answered soon after it showed stays shown the minimum.
    endSwitch: {
      while: ({ model }) => model.switching?.next != null,
      run: (self) =>
        Effect.gen(function* () {
          const shownAt = (yield* self.get).model.switching?.shownAt ?? 0;
          yield* Effect.sleep(
            Math.max(0, shownAt + SWITCH_MINIMUM - (yield* self.now)),
          );
          yield* self.send({ _tag: 'SwitchDone' });
        }),
    },
  },
  on: {
    SignIn: (_, { model }) =>
      idle(model)
        ? { model: { ...model, failed: null }, command: signIn() }
        : {},
    SwitchTo: ({ id }, { model, at }) =>
      idle(model) &&
      model.account._tag === 'SignedIn' &&
      model.account.active.id !== id &&
      model.account.accounts.some((each) => each.id === id)
        ? {
            model: {
              ...model,
              busy: id,
              failed: null,
              switching: { id, since: at, shownAt: null, next: null },
            },
            command: switchTo({ id }),
          }
        : {},
    SignOut: (_, { model }) =>
      idle(model) && model.account._tag === 'SignedIn'
        ? {
            model: { ...model, busy: model.account.active.id, failed: null },
            command: signOut(),
          }
        : {},
    SignOutAll: (_, { model }) =>
      idle(model) && model.account._tag === 'SignedIn'
        ? {
            model: { ...model, busy: 'all', failed: null },
            command: signOutAll(),
          }
        : {},
    Changed: (now, { model, at }) => ({ model: changed(model, now, at) }),
    SwitchShown: (_, { model, at }) =>
      model.switching
        ? {
            model: { ...model, switching: { ...model.switching, shownAt: at } },
          }
        : {},
    SwitchDone: (_, { model }) => ({ model: switchDone(model) }),
    // A switch ends when its answer is shown, not when the call returns.
    Settled: (_, { model }) =>
      model.switching === null ? { model: { ...model, busy: null } } : {},
    Failed: ({ message }, { model }) => ({
      model: { ...model, busy: null, switching: null, failed: message },
    }),
  },
});

/**
 * The slot at the top right of the header, the width of the "Sign in"
 * button in every state: "Sign in" when signed out, the Account menu when
 * signed in, and while checking, the avatar of the Account last seen here,
 * or nothing. A server draws it checking; the browser fills it in.
 */
export const AccountSwitcherView: ViewOf<typeof AccountSwitcherLive> =
  View.make(AccountSwitcherLive, ({ root, model, send }) => {
    const { account, switching } = model;
    return (
      <Slot {...root}>
        {account._tag === 'SignedOut' ? (
          <SignInButton onClick={() => send({ _tag: 'SignIn' })} />
        ) : account._tag === 'SignedIn' ? (
          <AccountMenu
            active={account.active}
            accounts={account.accounts}
            maxAccounts={model.maxAccounts}
            busy={model.busy}
            switching={
              switching && {
                id: switching.id,
                shown: switching.shownAt !== null,
              }
            }
            failed={model.failed}
            onSwitch={(id) => send({ _tag: 'SwitchTo', id })}
            onAdd={() => send({ _tag: 'SignIn' })}
            onSignOut={() => send({ _tag: 'SignOut' })}
            onSignOutAll={() => send({ _tag: 'SignOutAll' })}
          />
        ) : account.last ? (
          <Remembered account={account.last} />
        ) : (
          <span role="status" className="sr-only">
            Checking who is signed in
          </span>
        )}
      </Slot>
    );
  });
