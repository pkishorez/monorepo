import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  type Account,
  Accounts,
  AccountsState,
  AuthWorkerUnreachable,
} from '@kestack/auth-toolkit/client';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { memoryHost, type Host } from '../../host/index.ts';
import type { StatusCell } from '../../session/index.ts';
import { createGate, type GateView } from '../index.ts';
import { gateTable } from '../memory.ts';

const user = (id: string): Account => ({
  id,
  name: id,
  email: `${id}@example.com`,
  image: null,
});
const ada = user('ada');
const mary = user('mary');

type Opened = { readonly id: string; readonly status: StatusCell };

const unreachable = new AuthWorkerUnreachable({ url: 'https://auth.test' });

/** A sign-in service and a device whose state a test moves by hand, behind
 * an `Accounts` the way `browser()` gives it: checking at start, from the
 * account last seen here if there is one. */
const world = (options: {
  signedIn: Array<{ user: Account; active?: boolean }>;
  /** The account last seen here, opened before the Backend answers. */
  last?: Account;
  /** The device the Gate runs on, to launch again on the same one. */
  platform?: Host;
  failOpen?: (id: string) => boolean;
  /** Written before the Gate starts. */
  before?: (platform: Host) => Promise<void>;
}) => {
  const state = {
    signedIn: options.signedIn,
    reachable: true,
    online: true,
    log: [] as string[],
    kept: [] as string[][],
    slowSwitch: null as PromiseWithResolvers<void> | null,
  };
  const answer = (): AccountsState => {
    const accounts = state.signedIn.map(({ user }) => user);
    const active =
      state.signedIn.find(({ active }) => active === true)?.user ?? accounts[0];
    return active === undefined
      ? AccountsState.SignedOut()
      : AccountsState.SignedIn({ active, accounts });
  };
  const accounts = Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make<AccountsState>(
        AccountsState.Checking(
          options.last === undefined ? {} : { last: options.last },
        ),
      );
      const check = Effect.suspend(() =>
        state.reachable ? Effect.succeed(answer()) : Effect.fail(unreachable),
      ).pipe(Effect.tap((answered) => SubscriptionRef.set(ref, answered)));
      yield* Effect.forkScoped(Effect.ignore(check));
      return Accounts.of({
        state: SubscriptionRef.changes(ref),
        current: SubscriptionRef.get(ref),
        check,
        signIn: () => Effect.void,
        switchTo: (userId) =>
          Effect.gen(function* () {
            if (!state.reachable) return yield* unreachable;
            const slow = state.slowSwitch;
            if (slow !== null) yield* Effect.promise(() => slow.promise);
            state.log.push(`active ${userId}`);
            state.signedIn = state.signedIn.map((entry) => ({
              ...entry,
              active: entry.user.id === userId,
            }));
            yield* check;
          }),
        signOut: (userId) =>
          Effect.gen(function* () {
            state.log.push(`sign out ${userId ?? 'active'}`);
            state.signedIn = state.signedIn.filter(
              ({ user }) => user.id !== userId,
            );
            yield* check;
          }),
        signOutAll: Effect.gen(function* () {
          state.log.push('sign out everyone');
          state.signedIn = [];
          yield* check;
        }),
      });
    }),
  );
  const platform =
    options.platform ?? memoryHost({ online: () => state.online });
  const gate = createGate<Opened, never>({
    host: () => platform,
    cloud: () => accounts,
    local: async () => accounts,
    session: (account, status) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (options.failOpen?.(account.id) === true)
            throw new Error('corrupt copy');
          state.log.push(`open ${account.id}`);
          return { id: account.id, status };
        }),
        (opened) => Effect.sync(() => state.log.push(`close ${opened.id}`)),
      ),
    keep: (ids) =>
      Effect.sync(() => {
        state.kept.push([...ids]);
      }),
  });
  // Something asks, so the Gate starts, on what the device remembers.
  void Promise.resolve()
    .then(() => options.before?.(platform))
    .then(() => gate.subscribe(() => {}));
  const until = (seen: (view: GateView<Opened>) => boolean) =>
    vi.waitFor(() => expect(seen(gate.view())).toBe(true));
  const openOn = (id: string) =>
    until((view) => view.kind === 'open' && view.session.id === id);
  const lostWith = (id: string, others: ReadonlyArray<string>) =>
    until(
      (view) =>
        view.kind === 'accountLost' &&
        view.account.id === id &&
        view.accounts.map((account) => account.id).join() === others.join(),
    );
  // Something changed on the sign-in service, and the Gate asks again.
  const elsewhere = (signedIn: typeof state.signedIn) => {
    state.signedIn = signedIn;
    gate.checkAgain();
  };
  return { state, gate, platform, until, openOn, lostWith, elsewhere };
};

const statusOf = (view: GateView<Opened>) =>
  view.kind === 'open' ? view.session.status.get().state : null;

describe('the Gate', () => {
  it('finds who is signed in and opens the Active Account', async () => {
    const { state, openOn } = world({
      signedIn: [{ user: ada }, { user: mary, active: true }],
    });
    await openOn('mary');
    expect(state.log).toEqual(['open mary']);
    expect(state.kept.at(-1)).toEqual(['ada', 'mary']);
  });

  it('opens the account last seen at once, verifying until the Backend answers', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      last: ada,
    });
    state.reachable = false;
    await openOn('ada');
    expect(statusOf(gate.view())).toBe('verifying');
    state.reachable = true;
    gate.checkAgain();
    await vi.waitFor(() => expect(statusOf(gate.view())).toBe('verified'));
    expect(state.log).toEqual(['open ada']);
  });

  it('shows the sign-in service out of reach when nobody was seen here', async () => {
    const { state, gate, until, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      before: async () => {
        state.reachable = false;
      },
    });
    await until(
      (view) => view.kind === 'signedOut' && view.unreachable === true,
    );
    state.reachable = true;
    gate.checkAgain();
    await openOn('ada');
  });

  it('switches: closes the Session at once and opens once the Backend has switched', async () => {
    const { state, gate, until, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.slowSwitch = Promise.withResolvers();
    gate.switchTo('mary');
    await until(
      (view) => view.kind === 'opening' && view.account.id === 'mary',
    );
    await vi.waitFor(() => expect(state.log).toContain('close ada'));
    expect(state.log).not.toContain('open mary');
    state.slowSwitch.resolve();
    await openOn('mary');
    expect(state.log).toEqual([
      'open ada',
      'close ada',
      'active mary',
      'open mary',
    ]);
  });

  it('stays on the account when the switch cannot reach the Backend', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.reachable = false;
    gate.switchTo('mary');
    await vi.waitFor(() => expect(state.log).toContain('close ada'));
    await openOn('ada');
    expect(state.log).not.toContain('active mary');
  });

  it('leaves the cookie on the last of several quick switches', async () => {
    const zoe = user('zoe');
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }, { user: zoe }],
    });
    await openOn('ada');
    state.slowSwitch = Promise.withResolvers();
    gate.switchTo('mary');
    gate.switchTo('zoe');
    state.slowSwitch.resolve();
    await openOn('zoe');
    expect(state.signedIn.find(({ active }) => active)?.user.id).toBe('zoe');
    expect(state.log).not.toContain('open mary');
  });

  it('follows an Account Switch made elsewhere, with no Account Lost', async () => {
    const { openOn, elsewhere } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    elsewhere([{ user: ada }, { user: mary, active: true }]);
    await openOn('mary');
  });

  it('stops at an Account Lost, keeping the Copy, until the User acts', async () => {
    const { state, gate, lostWith, openOn, elsewhere } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    // Ada is signed out elsewhere.
    elsewhere([{ user: mary }]);
    await lostWith('ada', ['mary']);
    expect(state.log).toContain('close ada');
    expect(state.kept.at(-1)).toEqual(['mary', 'ada']);
    expect(gate.notice()).toBeNull();
    // Switching to Mary deletes Ada's Copy.
    gate.switchTo('mary');
    await openOn('mary');
    await vi.waitFor(() => expect(state.kept.at(-1)).toEqual(['mary']));
  });

  it('shows the Account Lost again on the next launch, even offline', async () => {
    const first = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await first.openOn('ada');
    first.elsewhere([{ user: mary }]);
    await first.lostWith('ada', ['mary']);

    const again = world({ signedIn: [], platform: first.platform });
    again.state.reachable = false;
    await again.until(
      (view) => view.kind === 'accountLost' && view.account.id === 'ada',
    );
  });

  it('opens the lost account again, with its Copy, once it signs in again', async () => {
    const { state, lostWith, openOn, elsewhere } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    elsewhere([{ user: mary }]);
    await lostWith('ada', ['mary']);
    elsewhere([{ user: mary }, { user: ada, active: true }]);
    await openOn('ada');
    expect(state.kept.at(-1)).toEqual(['mary', 'ada']);
  });

  it('forgets the lost account when someone new signs in', async () => {
    const zoe = user('zoe');
    const { state, lostWith, openOn, elsewhere } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    elsewhere([{ user: mary }]);
    await lostWith('ada', ['mary']);
    elsewhere([{ user: mary }, { user: zoe, active: true }]);
    await openOn('zoe');
    expect(state.kept.at(-1)).toEqual(['mary', 'zoe']);
  });

  it('signs out of a lost account with nobody left, offline too', async () => {
    const { state, gate, lostWith, until, elsewhere } = world({
      signedIn: [{ user: ada, active: true }],
    });
    await until((view) => view.kind === 'open');
    elsewhere([]);
    await lostWith('ada', []);
    state.online = false;
    expect(gate.signOut()).toBe(true);
    state.online = true;
    await until((view) => view.kind === 'signedOut');
    expect(state.kept.at(-1)).toEqual([]);
  });

  it('reports no Account Lost for a sign-out of its own', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    expect(gate.signOut()).toBe(true);
    await openOn('mary');
    expect(state.log).toContain('sign out ada');
  });

  it('refuses to sign out while the cloud Backend is out of reach', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
    });
    await openOn('ada');
    state.online = false;
    expect(gate.signOut()).toBe(false);
    expect(gate.signOutEveryone()).toBe(false);
    expect(state.log).not.toContain('sign out ada');
  });

  it('stops trying an account that will not open, and tries again when asked', async () => {
    let broken = true;
    const { gate, until, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      failOpen: () => broken,
    });
    await until((view) => view.kind === 'unopenable');
    broken = false;
    gate.retry();
    await openOn('ada');
  });

  it('runs each Backend apart, and closes the Session first', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
    });
    await openOn('ada');
    await gate.setBackend('local');
    await openOn('ada');
    expect(gate.backend()).toBe('local');
    expect(state.log).toEqual(['open ada', 'close ada', 'open ada']);
  });

  it('reads a Backend kept as `device` as the Local Backend, with its account lost', async () => {
    // What the Gate kept before the Device Backend was the Local Backend.
    const V1 = ESchema.make('GateMemory', {
      backend: Schema.NullOr(Schema.Literals(['cloud', 'device'])),
      cloud: Remembered,
      device: Remembered,
    }).build();
    const { gate, until } = world({
      signedIn: [{ user: mary, active: true }],
      before: (platform) =>
        Effect.runPromise(
          StdTable.make('auth-gate')
            .primary('pk', 'sk')
            .build()
            .singleEntity(V1)
            .default({ backend: null, cloud: NOBODY, device: NOBODY })
            .put({
              backend: 'device',
              cloud: NOBODY,
              device: {
                accounts: [
                  { user: ada, active: true },
                  { user: mary, active: false },
                ],
                lost: ada,
              },
            })
            .pipe(Effect.provide(platform.storage.table(gateTable, 'gate'))),
        ).then(() => undefined),
    });
    await until(
      (view) => view.kind === 'accountLost' && view.account.id === 'ada',
    );
    expect(gate.backend()).toBe('local');
  });
});

const Remembered = Schema.Struct({
  accounts: Schema.Array(
    Schema.Struct({
      user: Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        email: Schema.String,
        image: Schema.NullOr(Schema.String),
      }),
      active: Schema.Boolean,
    }),
  ),
  lost: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      email: Schema.String,
      image: Schema.NullOr(Schema.String),
    }),
  ),
});
const NOBODY = { accounts: [], lost: null };
