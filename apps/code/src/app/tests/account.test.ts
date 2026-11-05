import { AccountsState } from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import {
  kept,
  nowhere,
  placeOf,
  settled,
  shownOf,
  type Signed,
  signedFrom,
  startOf,
} from '../actor.ts';
import { home, project, type Route, session, settings } from '../app.ts';

/*
 * The root page's Account step: the Account last signed in is the one
 * active while it is checked, and it is never said to be checked then;
 * only a real answer prunes, keeping every Account signed in on this
 * device; and `/`, and an address the app had before its pages were an
 * Account's, are the same page under the Account active, once one is
 * known; placed under the Account this device kept, the guess is
 * corrected once the Auth Worker answers another, and a page the user
 * opened never is. An address that never named a page says so.
 */

const account = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  image: null,
  test: false,
});

const checking = (last: string | null): Signed => ({
  _tag: 'Checking',
  last: last === null ? null : { id: last, email: `${last}@example.com` },
});

const signedIn = (id: string, ...others: ReadonlyArray<string>): Signed => ({
  _tag: 'SignedIn',
  id,
  email: `${id}@example.com`,
  accounts: [id, ...others],
});

const signedOut: Signed = { _tag: 'SignedOut' };

const reading: Signed = { _tag: 'Reading' };

const shown = (id: string) => ({ id, email: `${id}@example.com` });

describe('the Account step', () => {
  it('draws no Account while this device is read', () => {
    expect(shownOf(reading)).toBeNull();
  });

  it('prunes nothing as what this device kept is read', () => {
    expect(kept(reading, checking('a1'))).toBeNull();
  });

  it('prunes as the first answer comes straight after reading', () => {
    expect(kept(reading, signedIn('a1', 'a2'))).toEqual(['a1', 'a2']);
  });

  it('keeps the Account last active while it is checked', () => {
    expect(signedFrom(AccountsState.Checking({ last: account('a1') }))).toEqual(
      checking('a1'),
    );
    expect(signedFrom(AccountsState.Checking({}))).toEqual(checking(null));
  });

  it('draws as the Account last active while it is checked', () => {
    expect(shownOf(checking('a1'))).toEqual(shown('a1'));
    expect(shownOf(checking(null))).toBeNull();
    expect(shownOf(signedIn('a2', 'a1'))?.id).toBe('a2');
    expect(shownOf(signedOut)).toBeNull();
  });

  it('prunes on the first real answer, keeping every Account signed in', () => {
    expect(kept(checking('a1'), signedIn('a1', 'a2'))).toEqual(['a1', 'a2']);
    expect(kept(checking(null), signedIn('a1'))).toEqual(['a1']);
  });

  it('prunes nothing while it is still checked', () => {
    expect(kept(checking('a1'), checking('a1'))).toBeNull();
    expect(kept(checking(null), checking('a1'))).toBeNull();
  });

  it('prunes nothing when no Account goes', () => {
    expect(kept(signedIn('a1'), signedIn('a1', 'a2'))).toBeNull();
    expect(kept(signedOut, signedIn('a1'))).toBeNull();
    expect(kept(signedIn('a1', 'a2'), signedIn('a2', 'a1'))).toBeNull();
  });

  it('keeps the rest as one Account is signed out, and none as every one is', () => {
    expect(kept(signedIn('a1', 'a2'), signedIn('a2'))).toEqual(['a2']);
    expect(kept(signedIn('a1'), signedOut)).toEqual([]);
    expect(kept(checking('a1'), signedOut)).toEqual([]);
    expect(kept(checking(null), signedOut)).toEqual([]);
  });
});

describe('before the app', () => {
  it('draws the mark while it checks who is signed in, with an Account kept here or none', () => {
    expect(startOf(checking('a1'))).toBe('waiting');
    expect(startOf(checking(null))).toBe('waiting');
  });

  it('draws the mark while this device is read, and signing in once signed out', () => {
    expect(startOf(reading)).toBe('waiting');
    expect(startOf(signedOut)).toBe('signed-out');
  });
});

describe('placing the app under the Account active', () => {
  const at = (path: string | null) => ({
    page: undefined,
    notFound: path,
  });

  it('sends `/` home, once an Account is known', () => {
    expect(placeOf(checking('a1'), at(null))).toEqual(home('a1'));
    expect(placeOf(signedIn('a2', 'a1'), at(null))).toEqual(home('a2'));
    expect(placeOf(reading, at(null))).toBeNull();
    expect(placeOf(checking(null), at(null))).toBeNull();
    expect(placeOf(signedOut, at(null))).toBeNull();
  });

  it('sends an old address to the same page under the Account active', () => {
    expect(placeOf(signedIn('a1'), at('/settings'))).toEqual(settings('a1'));
    expect(placeOf(signedIn('a1'), at('/settings/connections'))).toEqual(
      settings('a1'),
    );
    expect(placeOf(signedIn('a1'), at('/m/m1/p/p1'))).toEqual(
      project('a1', 'm1', 'p1'),
    );
    expect(placeOf(checking('a1'), at('/m/m1/p/p1/s/s1'))).toEqual(
      session('a1', 'm1', 'p1', 's1'),
    );
  });

  it('leaves an address that names no page, and one under an Account, where it is', () => {
    expect(placeOf(signedIn('a1'), at('/kabuki'))).toBeNull();
    expect(placeOf(signedIn('a1'), at('/m/m1'))).toBeNull();
    expect(placeOf(signedIn('a1'), at('/m/m1/p/p1/s/s1/x'))).toBeNull();
    expect(
      placeOf(signedIn('a1'), { page: home('a2'), notFound: null }),
    ).toBeNull();
  });
});

describe('correcting the guess the app placed a page under', () => {
  const at = (page: Route) => ({ page, notFound: null });

  it('moves a page it placed under the Account kept to the same page under the one answered', () => {
    expect(
      placeOf(signedIn('a2', 'a1'), at(session('a1', 'm1', 'p1', 's1')), 'a1'),
    ).toEqual(session('a2', 'm1', 'p1', 's1'));
    expect(placeOf(signedIn('a2', 'a1'), at(home('a1')), 'a1')).toEqual(
      home('a2'),
    );
  });

  it('never moves a page it did not place, nor one while it is still checked, nor one answered as guessed', () => {
    expect(placeOf(signedIn('a2', 'a1'), at(home('a1')))).toBeNull();
    expect(placeOf(checking('a1'), at(home('a1')), 'a1')).toBeNull();
    expect(placeOf(signedIn('a1'), at(home('a1')), 'a1')).toBeNull();
    expect(placeOf(signedIn('a2', 'a1'), at(home('a3')), 'a1')).toBeNull();
  });

  it('keeps a guess through a sign-out, so signing in as another moves the page under them', () => {
    expect(settled(signedOut, at(home('a1')), 'a1')).toBe(false);
    expect(placeOf(signedOut, at(home('a1')), 'a1')).toBeNull();
    expect(placeOf(signedIn('a2'), at(home('a1')), 'a1')).toEqual(home('a2'));
  });

  it('settles once answered as guessed, or the page is under another Account', () => {
    expect(settled(signedIn('a1'), at(home('a1')), 'a1')).toBe(true);
    expect(settled(signedIn('a2', 'a1'), at(home('a2')), 'a1')).toBe(true);
    expect(settled(checking('a1'), at(home('a3')), 'a1')).toBe(true);
    expect(settled(signedIn('a2', 'a1'), at(home('a1')), 'a1')).toBe(false);
    expect(settled(checking('a1'), at(home('a1')), 'a1')).toBe(false);
    // Still at `/`, on its way to its place.
    expect(
      settled(checking('a1'), { page: undefined, notFound: '/' }, 'a1'),
    ).toBe(false);
  });
});

describe('an address that names no page', () => {
  const at = (path: string) => ({ page: undefined, notFound: path });

  it('says so, whoever is signed in, but for `/` and an address the app had before', () => {
    expect(nowhere(at('/kabuki'))).toBe(true);
    expect(nowhere(at('/a/a1/nothing'))).toBe(true);
    expect(nowhere(at('/'))).toBe(false);
    expect(nowhere(at('/settings'))).toBe(false);
    expect(nowhere(at('/m/m1/p/p1/s/s1'))).toBe(false);
    expect(nowhere({ page: home('a1'), notFound: null })).toBe(false);
  });
});
