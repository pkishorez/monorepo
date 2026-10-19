import { describe, expect, it } from 'vitest';
import { settle } from './settle.ts';

const ada = { id: 'u-ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'u-bob', email: 'bob@demo', name: 'Bob' };
const member = (account: typeof ada) => ({
  userId: account.id,
  email: account.email,
  name: account.name,
});
const signedIn = (account: typeof ada, arrivedAt = 1) => ({
  visitor: { _tag: 'SignedIn' as const, member: member(account) },
  arrivedAt,
});
const seen = (active: typeof ada | null) => ({
  active,
  all: active ? [active] : [],
});

describe('Console settles who is signed in', () => {
  it('trusts the Worker until the browser’s Accounts have spoken', () => {
    expect(settle(null, signedIn(ada), null)).toEqual({
      state: { _tag: 'SignedIn', member: member(ada) },
      ask: null,
    });
    expect(
      settle(
        null,
        { visitor: { _tag: 'NotInvited', email: 'x@y' }, arrivedAt: 1 },
        null,
      ).state,
    ).toEqual({ _tag: 'NotInvited', email: 'x@y' });
  });

  it('is signed in when the Accounts and the Worker name the same member', () => {
    expect(settle(seen(ada), signedIn(ada), null).state).toEqual({
      _tag: 'SignedIn',
      member: member(ada),
    });
  });

  it('is signed out as soon as the browser has no account, whatever the Worker said', () => {
    expect(settle(seen(null), signedIn(ada), null)).toEqual({
      state: { _tag: 'SignedOut' },
      ask: null,
    });
  });

  it('asks the Worker again when another account became active, and waits for its answer', () => {
    const asked = settle(seen(bob), signedIn(ada, 1), null);
    expect(asked).toEqual({
      state: { _tag: 'Checking' },
      ask: { active: bob.id, arrivedAt: 1 },
    });
    // The Accounts say so again, or the old answer comes again: still
    // checking, never the member before.
    expect(settle(seen(bob), signedIn(ada, 1), asked.ask)).toEqual({
      state: { _tag: 'Checking' },
      ask: null,
    });
    // A new answer that names Bob settles it.
    expect(settle(seen(bob), signedIn(bob, 2), asked.ask).state).toEqual({
      _tag: 'SignedIn',
      member: member(bob),
    });
    // A new answer that still names Ada: neither is trusted.
    expect(settle(seen(bob), signedIn(ada, 2), asked.ask)).toEqual({
      state: { _tag: 'Unreachable' },
      ask: null,
    });
  });

  it('asks again when the browser signed in but the Worker saw nobody', () => {
    expect(
      settle(seen(ada), { visitor: { _tag: 'SignedOut' }, arrivedAt: 1 }, null)
        .ask,
    ).not.toBeNull();
  });

  it('keeps checking while the Worker’s answer is on its way', () => {
    expect(settle(seen(ada), undefined, null)).toEqual({
      state: { _tag: 'Checking' },
      ask: null,
    });
  });

  it('matches an invite refusal by email, in any case', () => {
    expect(
      settle(
        seen(ada),
        { visitor: { _tag: 'NotInvited', email: 'ADA@demo' }, arrivedAt: 1 },
        null,
      ).state,
    ).toEqual({ _tag: 'NotInvited', email: 'ADA@demo' });
  });
});
