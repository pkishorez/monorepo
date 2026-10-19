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
 * disagree, the Worker is asked again, and Console waits, never showing
 * the member before, until a newer word arrives. If that one disagrees
 * too, neither is trusted: Console says the sign-in service did not answer,
 * and Retry asks both again. So the two never ask each other forever.
 */

type VisitorData = typeof Visitor.Type;
type AccountData = typeof Account.Type;
type State = typeof ConsoleState.Type;
type Seen = {
  readonly active: AccountData | null;
  readonly all: ReadonlyArray<AccountData>;
} | null;

/** A question put to the Worker: for which active account, about the word that arrived when. */
export interface Asked {
  readonly active: string;
  readonly arrivedAt: number;
}

/** The Worker's word, and when it arrived. */
export interface Word {
  readonly visitor: VisitorData;
  readonly arrivedAt: number;
}

export interface Settled {
  readonly state: State;
  /** The question to put to the Worker; null to ask nothing. */
  readonly ask: Asked | null;
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
  word: Word | undefined,
  asked: Asked | null,
): Settled => {
  if (seen !== null && seen.active === null)
    return { state: { _tag: 'SignedOut' }, ask: null };
  if (word === undefined) return { state: { _tag: 'Checking' }, ask: null };
  if (seen === null || agree(word.visitor, seen.active!))
    return { state: stateOf(word.visitor), ask: null };
  const active = seen.active!.id;
  if (asked === null || asked.active !== active)
    return {
      state: { _tag: 'Checking' },
      ask: { active, arrivedAt: word.arrivedAt },
    };
  return word.arrivedAt === asked.arrivedAt
    ? { state: { _tag: 'Checking' }, ask: null }
    : { state: { _tag: 'Unreachable' }, ask: null };
};
