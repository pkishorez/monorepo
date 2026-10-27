import { Effect, Layer } from 'effect';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import { whereOf } from '../store.ts';

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

const place = { machineId: 'm1', projectId: 'p1', sessionId: 's1' };

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
