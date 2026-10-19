import { describe, expect, it } from 'vitest';
import { settle } from './settle.ts';

const ada = { id: 'u-ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'u-bob', email: 'bob@demo', name: 'Bob' };
const member = (account: typeof ada) => ({
  userId: account.id,
  email: account.email,
  name: account.name,
});
const signedIn = (account: typeof ada) => ({
  _tag: 'SignedIn' as const,
  member: member(account),
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
    expect(settle(null, { _tag: 'NotInvited', email: 'x@y' }, null)).toEqual({
      state: { _tag: 'NotInvited', email: 'x@y' },
      ask: null,
    });
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

  it('asks the Worker again, once, when another account became active', () => {
    const asked = settle(seen(bob), signedIn(ada), null);
    expect(asked.state).toEqual({ _tag: 'Checking' });
    expect(asked.ask).not.toBeNull();
    // Asked already and still apart: the Worker's word stands.
    expect(settle(seen(bob), signedIn(ada), asked.ask)).toEqual({
      state: { _tag: 'SignedIn', member: member(ada) },
      ask: null,
    });
  });

  it('asks again when the browser signed in but the Worker saw nobody', () => {
    expect(settle(seen(ada), { _tag: 'SignedOut' }, null).ask).not.toBeNull();
  });

  it('keeps checking while the Worker’s answer is on its way', () => {
    expect(settle(seen(ada), undefined, null)).toEqual({
      state: { _tag: 'Checking' },
      ask: null,
    });
  });

  it('matches an invite refusal by email, in any case', () => {
    expect(
      settle(seen(ada), { _tag: 'NotInvited', email: 'ADA@demo' }, null).state,
    ).toEqual({ _tag: 'NotInvited', email: 'ADA@demo' });
  });
});
