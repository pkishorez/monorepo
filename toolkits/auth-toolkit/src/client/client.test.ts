import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInSocial: vi.fn(),
}));

vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    useSession: vi.fn(),
    signIn: { social: mocks.signInSocial },
    signOut: vi.fn(),
  }),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    subscribe(() => undefined);
    return getSnapshot();
  },
}));

import { createAuthClient } from './client.js';

const stubBrowser = (href: string) => {
  const location = { href };
  const replaceState = vi.fn((_state, _title, nextURL: string) => {
    location.href = nextURL;
  });
  const pushState = vi.fn((_state, _title, nextURL: string) => {
    location.href = nextURL;
  });
  const dispatchEvent = vi.fn();

  const window = {
    location,
    history: { state: null, pushState, replaceState },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent,
  };
  vi.stubGlobal('window', window);

  return { location, window, replaceState, dispatchEvent };
};

describe('createAuthClient', () => {
  beforeEach(() => {
    mocks.signInSocial.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns to the clean current page after Google success or failure', () => {
    stubBrowser(
      'https://app.example.com/projects?id=42&error=old&error_description=stale#activity',
    );
    const client = createAuthClient({ baseURL: 'https://auth.example.com' });

    client.signIn.google();

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'https://app.example.com/projects?id=42#activity',
      errorCallbackURL: 'https://app.example.com/projects?id=42#activity',
    });
  });

  it('supports explicit callbacks outside a browser', () => {
    const client = createAuthClient({ baseURL: 'https://auth.example.com' });

    client.signIn.google({
      callbackURL: 'https://app.example.com/home',
      errorCallbackURL: 'https://app.example.com/login',
    });

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'https://app.example.com/home',
      errorCallbackURL: 'https://app.example.com/login',
    });
  });

  it('requires both explicit callbacks outside a browser', () => {
    const client = createAuthClient({ baseURL: 'https://auth.example.com' });

    expect(() =>
      client.signIn.google({ callbackURL: 'https://app.example.com/home' }),
    ).toThrow(/requires explicit callbackURL and errorCallbackURL/);
  });

  it('returns no redirected login error during server rendering', () => {
    const client = createAuthClient({ baseURL: 'https://auth.example.com' });

    const loginError = client.useLoginError();
    expect(loginError.error).toBeNull();
    expect(() => loginError.dismiss()).not.toThrow();
  });

  it('exposes and dismisses a structured redirected login error', () => {
    const browser = stubBrowser(
      'https://app.example.com/login?next=%2Fhome&error=email_not_allowed&error_description=Use+your+company+account#form',
    );
    const client = createAuthClient({ baseURL: 'https://auth.example.com' });

    const loginError = client.useLoginError();
    expect(loginError.error).toEqual({
      code: 'email_not_allowed',
      description: 'Use your company account',
    });

    loginError.dismiss();
    expect(browser.replaceState).toHaveBeenCalledWith(
      null,
      '',
      'https://app.example.com/login?next=%2Fhome#form',
    );
    expect(browser.dispatchEvent).toHaveBeenCalledOnce();
  });

  it('notifies subscribers when an SPA router calls pushState', () => {
    const browser = stubBrowser('https://app.example.com/login?error=denied');
    const client = createAuthClient({ baseURL: 'https://auth.example.com' });

    client.useLoginError();
    browser.dispatchEvent.mockClear();
    browser.window.history.pushState(null, '', 'https://app.example.com/home');

    expect(browser.dispatchEvent).toHaveBeenCalledOnce();
    expect(browser.location.href).toBe('https://app.example.com/home');
  });
});
