import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { SignIn, Unreachable, type User } from '../../account/index.js';
import { memoryPlatform, type Platform } from '../../platform/index.js';
import { createGate, type GateView } from '../index.js';
import { gateMemory, gateTable } from '../memory.js';

const user = (id: string): User => ({
  id,
  name: id,
  email: `${id}@example.com`,
  image: null,
});
const ada = user('ada');
const mary = user('mary');

type Opened = {
  readonly id: string;
  readonly token: Effect.Effect<string>;
};

/** A sign-in service and a device whose state a test moves by hand. */
const world = (options: {
  signedIn: Array<{ user: User; active?: boolean }>;
  /** The Remembered Accounts, the first one active. */
  remembered?: ReadonlyArray<User>;
  /** The device the Gate runs on, to launch again on the same one. */
  platform?: Platform;
  failOpen?: (id: string) => boolean;
}) => {
  const state = {
    signedIn: options.signedIn,
    reachable: true,
    online: true,
    log: [] as string[],
    kept: [] as string[][],
    slowSwitch: null as PromiseWithResolvers<void> | null,
  };
  const listed = () =>
    state.signedIn.map(({ user, active }) => ({
      user,
      token: `${user.id}-token`,
      active: active ?? false,
    }));
  const auth = Layer.succeed(SignIn, {
    list: Effect.suspend(() =>
      state.reachable
        ? Effect.succeed(listed())
        : Effect.fail(new Unreachable({ reason: 'offline' })),
    ),
    signIn: () => Effect.void,
    switchTo: (token: string) =>
      Effect.gen(function* () {
        if (!state.reachable)
          return yield* new Unreachable({ reason: 'offline' });
        const slow = state.slowSwitch;
        if (slow !== null) yield* Effect.promise(() => slow.promise);
        state.log.push(`active ${token}`);
        state.signedIn = state.signedIn.map((entry) => ({
          ...entry,
          active: `${entry.user.id}-token` === token,
        }));
      }),
    signOut: (token: string) =>
      Effect.sync(() => {
        state.log.push(`sign out ${token}`);
        state.signedIn = state.signedIn.filter(
          ({ user }) => `${user.id}-token` !== token,
        );
      }),
    signOutAll: Effect.sync(() => {
      state.log.push('sign out everyone');
      state.signedIn = [];
    }),
    takeLoginError: Effect.succeed(null),
  });
  const platform =
    options.platform ?? memoryPlatform({ online: () => state.online });
  const remembered = options.remembered;
  const written =
    remembered === undefined
      ? Promise.resolve()
      : Effect.runPromise(
          gateMemory(platform.storage.table(gateTable, 'gate')).update(
            (all) => ({
              ...all,
              cloud: {
                accounts: remembered.map((user, at) => ({
                  user,
                  active: at === 0,
                })),
                lost: null,
              },
            }),
          ),
        );
  const gate = createGate<Opened, never>({
    platform: () => platform,
    cloud: () => auth,
    device: async () => auth,
    session: (account, token) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (options.failOpen?.(account.user.id) === true)
            throw new Error('corrupt copy');
          state.log.push(`open ${account.user.id} ${account.token}`);
          return { id: account.user.id, token };
        }),
        (opened) => Effect.sync(() => state.log.push(`close ${opened.id}`)),
      ),
    keep: (ids) =>
      Effect.sync(() => {
        state.kept.push([...ids]);
      }),
  });
  // Something asks, so the Gate starts, on what the device remembers.
  void written.then(() => gate.subscribe(() => {}));
  const until = (seen: (view: GateView<Opened>) => boolean) =>
    vi.waitFor(() => expect(seen(gate.view())).toBe(true));
  const openOn = (id: string) =>
    until((view) => view.kind === 'open' && view.session.id === id);
  const lostWith = (id: string, others: ReadonlyArray<string>) =>
    until(
      (view) =>
        view.kind === 'accountLost' &&
        view.account.user.id === id &&
        view.accounts.map(({ user }) => user.id).join() === others.join(),
    );
  return { state, gate, platform, until, openOn, lostWith };
};

describe('the Gate', () => {
  it('finds who is signed in and opens the Active Account', async () => {
    const { state, openOn } = world({
      signedIn: [{ user: ada }, { user: mary, active: true }],
    });
    await openOn('mary');
    expect(state.log).toEqual(['open mary mary-token']);
    expect(state.kept.at(-1)).toEqual(['ada', 'mary']);
  });

  it('opens the account it remembers first, before the Backend answers', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      remembered: [ada],
    });
    state.reachable = false;
    await openOn('ada');
    expect(state.log).toEqual(['open ada null']);
    // The Backend answers later; the token arrives without reopening.
    state.reachable = true;
    gate.checkAgain();
    await vi.waitFor(async () => {
      const view = gate.view();
      if (view.kind !== 'open') throw new Error('not open');
      expect(await Effect.runPromise(view.session.token)).toBe('ada-token');
    });
    expect(state.log).toEqual(['open ada null']);
  });

  it('holds calls opened before the Backend answers until the token comes', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      remembered: [ada],
    });
    state.reachable = false;
    await openOn('ada');
    const view = gate.view();
    if (view.kind !== 'open') throw new Error('not open');
    const signed = Effect.runPromise(view.session.token);
    state.reachable = true;
    gate.checkAgain();
    expect(await signed).toBe('ada-token');
  });

  it('switches at once, and tells the Backend behind', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.slowSwitch = Promise.withResolvers();
    gate.switchTo('mary');
    // Mary is open before the sign-in service has switched, and without
    // waiting for Ada's lifetime to finish ending.
    await openOn('mary');
    await vi.waitFor(() =>
      expect([...state.log].sort()).toEqual([
        'close ada',
        'open ada ada-token',
        'open mary mary-token',
      ]),
    );
    state.slowSwitch.resolve();
    await vi.waitFor(() => expect(state.log).toContain('active mary-token'));
  });

  it('switches while offline and tells the Backend once it is back', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.reachable = false;
    gate.switchTo('mary');
    await openOn('mary');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.log).not.toContain('active mary-token');

    state.reachable = true;
    gate.checkAgain();
    await vi.waitFor(() => expect(state.log).toContain('active mary-token'));
    // Still Mary: the check after the switch agrees with it.
    await openOn('mary');
  });

  it('leaves the cookie on the last of several quick switches', async () => {
    const zoe = user('zoe');
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }, { user: zoe }],
    });
    await openOn('ada');
    state.slowSwitch = Promise.withResolvers();
    gate.switchTo('mary');
    await openOn('mary');
    gate.switchTo('zoe');
    await openOn('zoe');
    state.slowSwitch.resolve();
    await vi.waitFor(() =>
      expect(state.signedIn.find(({ active }) => active)?.user.id).toBe('zoe'),
    );
    await openOn('zoe');
  });

  it('shows every Remembered Account before the Backend answers', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      remembered: [ada, mary],
    });
    state.reachable = false;
    await openOn('ada');
    const accounts = () => {
      const view = gate.view();
      return view.kind === 'open'
        ? view.accounts.map(({ user }) => user.id)
        : [];
    };
    expect(accounts()).toEqual(['ada', 'mary']);
    // The Backend's answer replaces them whole.
    state.reachable = true;
    gate.checkAgain();
    await vi.waitFor(() => expect(accounts()).toEqual(['ada']));
  });

  it('follows an Account Switch made elsewhere, with no Account Lost', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.signedIn = [{ user: ada }, { user: mary, active: true }];
    gate.checkAgain();
    await openOn('mary');
  });

  it('stops at an Account Lost, keeping the Copy, until the User acts', async () => {
    const { state, gate, lostWith, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    // Ada is signed out elsewhere.
    state.signedIn = [{ user: mary }];
    gate.checkAgain();
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
    first.state.signedIn = [{ user: mary }];
    first.gate.checkAgain();
    await first.lostWith('ada', ['mary']);

    const again = world({ signedIn: [], platform: first.platform });
    again.state.reachable = false;
    await again.lostWith('ada', ['mary']);
  });

  it('opens the lost account again, with its Copy, once it signs in again', async () => {
    const { state, gate, lostWith, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.signedIn = [{ user: mary }];
    gate.checkAgain();
    await lostWith('ada', ['mary']);
    state.signedIn = [{ user: mary }, { user: ada, active: true }];
    gate.checkAgain();
    await openOn('ada');
    expect(state.kept.at(-1)).toEqual(['mary', 'ada']);
  });

  it('forgets the lost account when someone new signs in', async () => {
    const zoe = user('zoe');
    const { state, gate, lostWith, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    state.signedIn = [{ user: mary }];
    gate.checkAgain();
    await lostWith('ada', ['mary']);
    state.signedIn = [{ user: mary }, { user: zoe, active: true }];
    gate.checkAgain();
    await openOn('zoe');
    expect(state.kept.at(-1)).toEqual(['mary', 'zoe']);
  });

  it('signs out of a lost account with nobody left, offline too', async () => {
    const { state, gate, lostWith, until } = world({
      signedIn: [{ user: ada, active: true }],
    });
    await until((view) => view.kind === 'open');
    state.signedIn = [];
    gate.checkAgain();
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
    expect(state.log).toContain('sign out ada-token');
  });

  it('refuses to sign out while the cloud Backend is out of reach', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
    });
    await openOn('ada');
    state.online = false;
    expect(gate.signOut()).toBe(false);
    expect(gate.signOutEveryone()).toBe(false);
    expect(state.log).not.toContain('sign out ada-token');
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
    await gate.setBackend('device');
    await openOn('ada');
    expect(gate.backend()).toBe('device');
    expect(state.log).toEqual([
      'open ada ada-token',
      'close ada',
      'open ada ada-token',
    ]);
  });
});
