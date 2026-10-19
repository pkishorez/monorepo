import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Member } from '../../contracts/member/index.ts';
import { Browser } from '../capabilities/index.ts';
import { Settings } from '../settings/index.ts';
import { Welcome } from '../welcome/index.ts';

/*
 * Console: the sign-in gate every page sits under, at `/`. Its data is who
 * the visitor is, as the Worker found out when it drew the page, so the
 * first HTML is already signed out, not invited, or signed in with the page
 * filled in. In the browser it follows the Accounts, and asks the Worker
 * again when they no longer match what it said.
 *
 * A page joins by its definition in `pages` below, a folder of its own
 * under `src/shared/pages/<page>/`, and its build and View under
 * `src/client/pages/<page>/`, given to Console's build.
 */

/** Who the visitor is, as the Worker found out. */
export const Visitor = Schema.TaggedUnion({
  SignedOut: {},
  /** The Auth Worker could not be asked. */
  Unreachable: {},
  /** Signed in, but not on the Invite list. */
  NotInvited: { email: Schema.String },
  /** An invited member, as their User Space says. */
  SignedIn: { member: Member },
});

/** An account signed in on this browser, as the Account menu lists it. */
export const Account = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});

export const ConsoleModel = Schema.Struct({
  /** What this browser's Accounts last said; null until they have. */
  accounts: Schema.NullOr(
    Schema.Struct({
      active: Schema.NullOr(Account),
      all: Schema.Array(Account),
    }),
  ),
  /** The Account menu's action under way, by what it is for. */
  busy: Schema.NullOr(Schema.String),
  /** Asking for one more account, in Local mode, which asks who. */
  adding: Schema.Boolean,
  /** Why the last action failed, until the next one. */
  failure: Schema.NullOr(Schema.String),
  /** The question last put to the Worker: for which active account, about
   * the word that arrived when, so it is asked once and answered by a newer one. */
  asked: Schema.NullOr(
    Schema.Struct({ active: Schema.String, arrivedAt: Schema.Number }),
  ),
});

/** Who Console says is signed in. */
export const ConsoleState = Schema.TaggedUnion({
  /** Until this browser's Accounts and the Worker agree: drawn as the Worker said. */
  Checking: {},
  SignedOut: {},
  Unreachable: {},
  NotInvited: { email: Schema.String },
  SignedIn: { member: Member },
});

export const Console = Page.define({
  path: '/',
  render: 'dynamic',
  data: Visitor,
  metadata: { title: 'Alchemy Console' },
  pages: { Welcome, Settings },
  requires: [Accounts, Browser],
  model: ConsoleModel,
  state: ConsoleState,
  message: Schema.TaggedUnion({
    AccountsSeen: {
      active: Schema.NullOr(Account),
      all: Schema.Array(Account),
    },
    AccountsUnreachable: {},
    Visited: { visitor: Visitor, arrivedAt: Schema.Number },
    RetryChosen: {},
    SignInChosen: {
      email: Schema.NullOr(Schema.String),
      name: Schema.NullOr(Schema.String),
    },
    AddAccountChosen: {},
    AddAccountClosed: {},
    SwitchChosen: { userId: Schema.String },
    SignOutChosen: {},
    ActionDone: {},
    ActionFailed: { message: Schema.String },
  }),
});
