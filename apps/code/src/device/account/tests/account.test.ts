import { AccountsState } from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import {
  draw,
  kept,
  ready,
  running,
  shownOf,
  type Signed,
  signedFrom,
  startOf,
} from '../account.ts';

/*
 * The root page's Account step: drawn as the Account last signed in while
 * it is checked, and never said to be checked then; only a real answer
 * prunes, keeping every Account signed in on this device; and another
 * Account than the one drawn waits, the one drawn staying, until its
 * Machines are ready, then is drawn, home, in one step.
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
  it('never says it is checking while it draws an Account this device kept', () => {
    expect(startOf(checking('a1'))).toBe('reading');
  });

  it('says it is checking only with no Account kept here', () => {
    expect(startOf(checking(null))).toBe('checking');
  });

  it('draws the mark while this device is read, and signing in once signed out', () => {
    expect(startOf(reading)).toBe('reading');
    expect(startOf(signedOut)).toBe('signed-out');
  });
});

describe('drawing an Account', () => {
  it('draws the first Account at once, staying where it is', () => {
    expect(draw(null, shown('a1'))).toEqual({
      drawn: shown('a1'),
      home: false,
    });
  });

  it('keeps drawing the same Account, checked or answered', () => {
    expect(draw(shown('a1'), shown('a1'))).toEqual({
      drawn: shown('a1'),
      home: false,
    });
  });

  it('draws nothing at once, home, as every Account is signed out', () => {
    expect(draw(shown('a1'), null)).toEqual({ drawn: null, home: true });
    expect(draw(null, null)).toEqual({ drawn: null, home: false });
  });

  it('keeps the Account drawn on a switch, running both, until the next is ready', () => {
    expect(draw(shown('a1'), shown('a2'))).toEqual({
      drawn: shown('a1'),
      home: false,
    });
    expect(running(shown('a1'), shown('a2'))).toEqual([
      shown('a1'),
      shown('a2'),
    ]);
    expect(ready(shown('a1'), shown('a2'), 'a2')).toEqual({
      drawn: shown('a2'),
      home: true,
    });
    expect(running(shown('a2'), shown('a2'))).toEqual([shown('a2')]);
  });

  it('ignores an Account ready that is no longer the one wanted', () => {
    expect(ready(shown('a1'), shown('a3'), 'a2')).toEqual({
      drawn: shown('a1'),
      home: false,
    });
    expect(ready(shown('a1'), null, 'a2')).toEqual({
      drawn: shown('a1'),
      home: false,
    });
  });

  it('runs no Machines with no Account', () => {
    expect(running(null, null)).toEqual([]);
    expect(running(null, shown('a1'))).toEqual([shown('a1')]);
  });
});
