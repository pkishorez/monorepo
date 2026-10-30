import { Effect, Layer } from 'effect';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import { restoredOf, savedOf, whereOf } from '../store.ts';

/*
 * Where a Draft is kept: under the Account the app is drawn as, the one
 * signed in or, while that is checked, the one last active; nowhere with
 * nobody.
 */

const account = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  image: null,
  test: false,
});

const place = { connectionId: 'm1', projectId: 'p1', sessionId: 's1' };

const whereAs = (state: AccountsState) =>
  Effect.runPromise(
    whereOf(place).pipe(
      Effect.provide(Layer.mock(Accounts)({ current: Effect.succeed(state) })),
    ),
  );

describe('where a Draft is kept', () => {
  it('is under the Account signed in', async () => {
    const active = account('a1');
    expect(
      await whereAs(AccountsState.SignedIn({ active, accounts: [active] })),
    ).toEqual({ accountId: 'a1', ...place });
  });

  it('is under the Account last active while it is checked', async () => {
    expect(
      await whereAs(AccountsState.Checking({ last: account('a2') })),
    ).toEqual({ accountId: 'a2', ...place });
  });

  it('is nowhere with nobody', async () => {
    expect(await whereAs(AccountsState.Checking({}))).toBeNull();
    expect(await whereAs(AccountsState.SignedOut())).toBeNull();
  });
});

describe('a Saved Draft, on touch', () => {
  const blank = { text: '', anchor: 0, head: 0 };
  const shown = (open: boolean) => ({
    restored: true,
    where: null,
    started: false,
    mode: 'Message' as const,
    opening: { Message: blank, SideQuestion: blank },
    attachments: [],
    chosen: { account: null, model: null, settings: {} },
    branch: null,
    newWorktree: false,
    open,
  });

  it('keeps it open, even with nothing written, and opens it so again', () => {
    const saved = savedOf(shown(true), ['Message'], {});
    expect(saved).toMatchObject({ open: true });
    expect(restoredOf(saved!, ['Message']).open).toBe(true);
  });

  it('keeps nothing for an empty Draft left collapsed', () => {
    expect(savedOf(shown(false), ['Message'], {})).toBeNull();
  });
});
