import { Effect, Exit, Fiber } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInSocial: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  listDeviceSessions: vi.fn(),
  setActive: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('better-auth/client/plugins', () => ({
  multiSessionClient: () => ({ id: 'multi-session' }),
}));

vi.mock('better-auth/client', () => ({
  createAuthClient: () => ({
    signIn: { social: mocks.signInSocial },
    signOut: mocks.signOut,
    getSession: mocks.getSession,
    multiSession: {
      listDeviceSessions: mocks.listDeviceSessions,
      setActive: mocks.setActive,
      revoke: mocks.revoke,
    },
  }),
}));

import { SignIn } from '../../../account/index.js';
import { cookie } from '../cookie.js';

const stubBrowser = (href: string) => {
  const location = { href };
  const replaceState = vi.fn((_state, _title, nextURL: string) => {
    location.href = nextURL;
  });
  vi.stubGlobal('window', { location, history: { state: null, replaceState } });
  return { location, replaceState };
};

const run = <A, E>(effect: Effect.Effect<A, E, SignIn>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(cookie({ authWorkerUrl: 'https://auth.example.com' })),
    ),
  );

const ok = (data: unknown) => Promise.resolve({ data, error: null });

describe('cookie', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('goes to Google and comes back to the clean current page', async () => {
    stubBrowser(
      'https://app.example.com/projects?id=42&error=old&error_description=stale#activity',
    );
    mocks.signInSocial.mockReturnValue(ok({}));

    await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild((yield* SignIn).signIn());
        yield* Effect.sleep(1);
        // The page is leaving, so sign-in never completes.
        expect(fiber.pollUnsafe()).toBeUndefined();
        yield* Fiber.interrupt(fiber);
      }),
    );

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'https://app.example.com/projects?id=42#activity',
      errorCallbackURL: 'https://app.example.com/projects?id=42#activity',
    });
  });

  it('comes back where it is told to', async () => {
    stubBrowser('https://app.example.com/');
    mocks.signInSocial.mockReturnValue(ok({}));

    await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          (yield* SignIn).signIn({
            returnTo: 'https://app.example.com/home',
            errorReturnTo: 'https://app.example.com/login',
          }),
        );
        yield* Effect.sleep(1);
        yield* Fiber.interrupt(fiber);
      }),
    );

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'https://app.example.com/home',
      errorCallbackURL: 'https://app.example.com/login',
    });
  });

  it('takes the login error a sign-in came back with, once', async () => {
    const browser = stubBrowser(
      'https://app.example.com/login?next=%2Fhome&error=email_not_allowed&error_description=Use+your+company+account#form',
    );

    const [first, second] = await run(
      Effect.flatMap(SignIn, (accounts) =>
        Effect.all([accounts.takeLoginError, accounts.takeLoginError]),
      ),
    );

    expect(first).toEqual({
      code: 'email_not_allowed',
      description: 'Use your company account',
    });
    expect(second).toBeNull();
    expect(browser.replaceState).toHaveBeenCalledOnce();
    expect(browser.location.href).toBe(
      'https://app.example.com/login?next=%2Fhome#form',
    );
  });

  it('lists Signed-in Accounts with the Active Account marked', async () => {
    const user = (id: string) => ({ id, name: id, email: `${id}@x.com` });
    mocks.getSession.mockReturnValue(ok({ session: { token: 'mary-token' } }));
    mocks.listDeviceSessions.mockReturnValue(
      ok([
        { user: user('ada'), session: { token: 'ada-token' } },
        { user: user('mary'), session: { token: 'mary-token' } },
      ]),
    );

    expect(
      await run(Effect.flatMap(SignIn, (accounts) => accounts.list)),
    ).toEqual([
      {
        user: { ...user('ada'), image: null },
        token: 'ada-token',
        active: false,
      },
      {
        user: { ...user('mary'), image: null },
        token: 'mary-token',
        active: true,
      },
    ]);
  });

  it('fails Unreachable when the Auth Worker refuses, instead of listing nobody', async () => {
    mocks.getSession.mockReturnValue(ok(null));
    mocks.listDeviceSessions.mockResolvedValue({
      data: null,
      error: { status: 503 },
    });

    const exit = await run(
      Effect.exit(Effect.flatMap(SignIn, (accounts) => accounts.list)),
    );

    expect(exit).toMatchObject(
      Exit.fail({ _tag: 'Unreachable', reason: 'Auth Worker answered 503' }),
    );
  });

  it('switches and signs out one account by its token', async () => {
    mocks.setActive.mockReturnValue(ok({}));
    mocks.revoke.mockReturnValue(ok({ status: true }));

    await run(
      Effect.gen(function* () {
        const accounts = yield* SignIn;
        yield* accounts.switchTo('ada-token');
        yield* accounts.signOut('mary-token');
      }),
    );

    expect(mocks.setActive).toHaveBeenCalledWith({ sessionToken: 'ada-token' });
    expect(mocks.revoke).toHaveBeenCalledWith({ sessionToken: 'mary-token' });
  });
});
