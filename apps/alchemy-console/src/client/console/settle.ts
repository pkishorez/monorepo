import type {
  Account,
  ConsoleState,
  Visitor,
} from '../../shared/pages/index.ts';

/*
 * Who Console says is signed in, from its two witnesses: the Worker, which
 * verified the session when it drew the page (the Visitor), and this
 * browser's Accounts, which hear of every sign-in, switch and sign-out, in
 * any tab. Until the Accounts speak, the Worker's word stands. When they
 * disagree, the Worker is asked again, once for each disagreement; asked
 * already, its word stands, so the two can never ask each other forever.
 */

type VisitorData = typeof Visitor.Type;
type AccountData = typeof Account.Type;
type State = typeof ConsoleState.Type;
type Seen = {
  readonly active: AccountData | null;
  readonly all: ReadonlyArray<AccountData>;
} | null;

export interface Settled {
  readonly state: State;
  /** The disagreement to ask the Worker about, by a key; null to ask nothing. */
  readonly ask: string | null;
}

/** The State the Worker's word alone names. */
export const stateOf = (visitor: VisitorData): State => {
  switch (visitor._tag) {
    case 'SignedOut':
      return { _tag: 'SignedOut' };
    case 'Unreachable':
      return { _tag: 'Unreachable' };
    case 'NotInvited':
      return { _tag: 'NotInvited', email: visitor.email };
    case 'SignedIn':
      return { _tag: 'SignedIn', member: visitor.member };
  }
};

const agree = (visitor: VisitorData, active: AccountData) => {
  switch (visitor._tag) {
    case 'SignedIn':
      return visitor.member.userId === active.id;
    case 'NotInvited':
      return visitor.email.toLowerCase() === active.email.toLowerCase();
    default:
      return false;
  }
};

export const settle = (
  seen: Seen,
  visitor: VisitorData | undefined,
  asked: string | null,
): Settled => {
  if (seen !== null && seen.active === null)
    return { state: { _tag: 'SignedOut' }, ask: null };
  if (visitor === undefined) return { state: { _tag: 'Checking' }, ask: null };
  if (seen === null || agree(visitor, seen.active!))
    return { state: stateOf(visitor), ask: null };
  const ask = `${seen.active!.id} ${JSON.stringify(visitor)}`;
  return ask === asked
    ? { state: stateOf(visitor), ask: null }
    : { state: { _tag: 'Checking' }, ask };
};
