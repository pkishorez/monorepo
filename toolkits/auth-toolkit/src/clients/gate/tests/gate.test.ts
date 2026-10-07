import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { Auth, Unreachable } from '../../auth/index.js';
import {
  createGate,
  type GateUser,
  type GateView,
  memoryPlatform,
} from '../index.js';

const user = (id: string): GateUser => ({
  id,
  name: id,
  email: `${id}@example.com`,
  image: null,
});
const ada = user('ada');
const mary = user('mary');

type Opened = {
  readonly id: string;
  readonly token: () => string | null;
  readonly waitForToken: Effect.Effect<string>;
  readonly whileOpen: <A>(promise: Promise<A>) => Promise<A>;
};

/** A sign-in service and a device whose state a test moves by hand. */
const world = (options: {
  signedIn: Array<{ user: GateUser; active?: boolean }>;
  remembered?: GateUser;
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
  const auth = Layer.succeed(Auth, {
    list: Effect.suspend(() =>
      state.reachable
        ? Effect.succeed(listed())
        : Effect.fail(new Unreachable({ reason: 'offline' })),
    ),
    signIn: () => Effect.void,
    switchTo: (token) =>
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
    signOut: (token) =>
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
  const platform = memoryPlatform({ online: () => state.online });
  if (options.remembered !== undefined)
    void platform.memory.set(
      'gate:cloud:last',
      JSON.stringify(options.remembered),
    );
  const gate = createGate<Opened, never>({
    platform: () => platform,
    cloud: () => auth,
    device: async () => auth,
    session: (account) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (options.failOpen?.(account.user.id) === true)
            throw new Error('corrupt copy');
          state.log.push(`open ${account.user.id} ${account.token()}`);
          return {
            id: account.user.id,
            token: account.token,
            waitForToken: account.waitForToken,
            whileOpen: account.whileOpen,
          };
        }),
        (opened) => Effect.sync(() => state.log.push(`close ${opened.id}`)),
      ),
    keep: (ids) =>
      Effect.sync(() => {
        state.kept.push([...ids]);
      }),
  });
  // Something asks, so the Gate starts.
  gate.subscribe(() => {});
  const until = (seen: (view: GateView<Opened>) => boolean) =>
    vi.waitFor(() => expect(seen(gate.view())).toBe(true));
  const openOn = (id: string) =>
    until((view) => view.kind === 'open' && view.session.id === id);
  return { state, gate, until, openOn };
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
      remembered: ada,
    });
    state.reachable = false;
    await openOn('ada');
    expect(state.log).toEqual(['open ada null']);
    // The Backend answers later; the token arrives without reopening.
    state.reachable = true;
    gate.checkAgain();
    await vi.waitFor(() => {
      const view = gate.view();
      expect(view.kind === 'open' && view.session.token()).toBe('ada-token');
    });
    expect(state.log).toEqual(['open ada null']);
  });

  it('holds calls opened before the Backend answers until the token comes', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }],
      remembered: ada,
    });
    state.reachable = false;
    await openOn('ada');
    const view = gate.view();
    if (view.kind !== 'open') throw new Error('not open');
    const signed = Effect.runPromise(view.session.waitForToken);
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

  it('reports an Account Lost once, and opens whoever is left', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    // Ada is signed out elsewhere.
    state.signedIn = [{ user: mary, active: true }];
    gate.checkAgain();
    await openOn('mary');
    expect(gate.takeNotice()).toEqual({ kind: 'accountLost', user: ada });
    expect(gate.takeNotice()).toBeNull();
    expect(state.kept.at(-1)).toEqual(['mary']);
  });

  it('reports no Account Lost for a sign-out of its own', async () => {
    const { state, gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    expect(gate.signOut()).toBe(true);
    await openOn('mary');
    expect(state.log).toContain('sign out ada-token');
    expect(gate.takeNotice()).toBeNull();
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

  it('cuts off what a Session Lifetime started when it ends, without an error', async () => {
    const { gate, openOn } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await openOn('ada');
    const view = gate.view();
    if (view.kind !== 'open') throw new Error('not open');
    const answer = Promise.withResolvers<string>();
    let settled = false;
    view.session.whileOpen(answer.promise).then(
      () => (settled = true),
      () => (settled = true),
    );
    gate.switchTo('mary');
    await openOn('mary');
    answer.reject(new Error('interrupted'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
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

  it('runs each Backend apart, and closes the Session Lifetime first', async () => {
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
