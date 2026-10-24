import { Schema } from 'effect';
import type { AccountsState } from '@kestack/auth-toolkit/client';

/*
 * What the Account Switcher keeps, and how an Account Switch is timed: as
 * the Router times a move. Under way past `SWITCH_DELAY`, it shows; once
 * shown it stays at least `SWITCH_MINIMUM`. Until it ends, the Account
 * before stays the one shown, and then the new one takes its place in one
 * step.
 */

/** How long a switch is under way before it shows, as the Router's `delay`. */
export const SWITCH_DELAY = 150;
/** How long a switch, once shown, stays shown at least, as the Router's `minimum`. */
export const SWITCH_MINIMUM = 300;

const Account = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
});

type Account = typeof Account.Type;

/** Who is signed in, as shown: while checking, the Account last seen here, if remembered. */
export const Shown = Schema.TaggedUnion({
  Checking: { last: Schema.NullOr(Account) },
  SignedOut: {},
  SignedIn: { active: Account, accounts: Schema.Array(Account) },
});

type Shown = typeof Shown.Type;

/** The Account Switch under way: to whom, since when, when it showed, and,
 * once answered while it must stay shown, who is signed in then. */
const Switching = Schema.Struct({
  id: Schema.String,
  since: Schema.Number,
  shownAt: Schema.NullOr(Schema.Number),
  next: Schema.NullOr(Shown),
});

export const Model = Schema.Struct({
  account: Shown,
  switching: Schema.NullOr(Switching),
  /** The action under way: switching to or signing out an Account (its id), or signing out of `all`. */
  busy: Schema.NullOr(Schema.String),
  /** Why the last action failed, until the next. */
  failed: Schema.NullOr(Schema.String),
  /** How many Accounts the Auth Worker holds for one browser. */
  maxAccounts: Schema.Number,
});

type Model = typeof Model.Type;

const plain = ({ id, name, email, image }: Account): Account => ({
  id,
  name,
  email,
  image,
});

/** Who is signed in, and the Account a switch under way makes active. */
interface Now {
  readonly account: Shown;
  readonly switchingTo: string | null;
}

/** auth-toolkit's state as the Model keeps it: plain data, and the switch under way apart. */
export const fromAccounts = (state: AccountsState): Now => ({
  account:
    state._tag === 'SignedIn'
      ? {
          _tag: 'SignedIn',
          active: plain(state.active),
          accounts: state.accounts.map(plain),
        }
      : state._tag === 'Checking'
        ? {
            _tag: 'Checking',
            last: state.last ? plain(state.last) : null,
          }
        : { _tag: 'SignedOut' },
  switchingTo:
    state._tag === 'SignedIn' ? (state.switchingTo?.id ?? null) : null,
});

/** The switch is over: who is signed in now is shown, and nothing is under way. */
const switched = (model: Model, account: Shown): Model => ({
  ...model,
  account,
  switching: null,
  busy: null,
});

/** Who is signed in changed, or a switch began or was answered. */
export const changed = (
  model: Model,
  { account, switchingTo }: Now,
  at: number,
): Model => {
  const { switching } = model;
  // Under way: who was active stays shown.
  if (switchingTo !== null)
    return {
      ...model,
      switching:
        switching?.id === switchingTo
          ? { ...switching, next: null }
          : { id: switchingTo, since: at, shownAt: null, next: null },
    };
  if (switching === null) return { ...model, account };
  // Answered: shown a moment ago, it waits out the minimum first.
  return switching.shownAt !== null && at < switching.shownAt + SWITCH_MINIMUM
    ? { ...model, switching: { ...switching, next: account } }
    : switched(model, account);
};

/** The minimum is over: the answer waiting takes the place of who was shown. */
export const switchDone = (model: Model): Model =>
  model.switching?.next ? switched(model, model.switching.next) : model;

/** Whether an action may start: nothing else is under way. */
export const idle = (model: Model) =>
  model.busy === null && model.switching === null;

/** What the app's pages read: who is signed in, and the Account a switch on screen makes active. */
export const current = (model: Model) => {
  const { account, switching } = model;
  return {
    account,
    switching:
      switching?.shownAt != null && account._tag === 'SignedIn'
        ? (account.accounts.find((each) => each.id === switching.id) ?? null)
        : null,
  };
};
