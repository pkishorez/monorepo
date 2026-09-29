// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsentPage } from '../../consent/index.js';
import { DevicePage } from '../../device/index.js';
import { HomePage } from '../../home/index.js';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const branding = { appName: 'Example' };
const multiSession = { maximumAccounts: 5 };
const record = (name: string) => ({
  user: { id: name, name, email: `${name.toLowerCase()}@example.com` },
  session: {
    id: `session-${name}`,
    token: `token-${name}`,
    userAgent: 'Mozilla/5.0',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-29T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
  },
});
const ada = record('Ada');
const mary = record('Mary');

const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => (resolve = done));
  return { promise, resolve };
};

describe('multi-session pages', () => {
  let host: HTMLDivElement;
  let root: Root;
  let queries: QueryClient;
  let active: typeof ada | null;
  let records: Array<typeof ada>;
  let requests: string[];
  let accountResponse: Promise<Response> | undefined;
  let sessionResponse: Promise<Response> | undefined;
  let switchResponse: Promise<Response> | undefined;
  let lookupResponse: Promise<Response> | undefined;
  let owner: string | undefined;
  let answerFails: boolean;

  beforeEach(() => {
    active = ada;
    records = [ada, mary];
    requests = [];
    accountResponse =
      sessionResponse =
      switchResponse =
      lookupResponse =
        undefined;
    owner = undefined;
    answerFails = false;
    navigate.mockClear();
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input, window.location.origin);
        const path = url.pathname.replace('/api/auth', '');
        requests.push(path);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        switch (path) {
          case '/get-session':
            return sessionResponse ?? Response.json(active);
          case '/multi-session/list-device-sessions':
            return accountResponse ?? Response.json(records);
          case '/multi-session/revoke':
            records = records.filter(
              (record) => record.session.token !== body.sessionToken,
            );
            active = records[0] ?? null;
            return Response.json({ status: true });
          case '/multi-session/set-active':
            if (switchResponse) await switchResponse;
            active = records.find(
              (record) => record.session.token === body.sessionToken,
            )!;
            return Response.json(active);
          case '/sign-out':
            active = null;
            records = [];
            return Response.json({ success: true });
          case '/list-sessions':
            return Response.json(active ? [active.session] : []);
          case '/device':
            owner ??= active?.user.id;
            return (
              lookupResponse ??
              Response.json({
                status: 'pending',
                ...(owner === active?.user.id ? { client_id: 'demo' } : {}),
              })
            );
          case '/device/approve':
          case '/device/deny':
            return answerFails
              ? Response.json({ message: 'Try again.' }, { status: 500 })
              : owner === active?.user.id
                ? Response.json({ success: true })
                : Response.json({ message: 'Wrong account.' }, { status: 403 });
          case '/oauth2/public-client':
            return Response.json({ client_name: 'Demo app' });
          default:
            throw new Error(`Unexpected request: ${path}`);
        }
      }),
    );
    queries = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    queries.clear();
    vi.unstubAllGlobals();
  });

  const render = async (page: ReactNode) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queries}>{page}</QueryClientProvider>,
      );
    });
  };

  const eventually = (check: () => void) =>
    vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      check();
    });

  const button = (label: string) => {
    const found = [...document.querySelectorAll('button')].find(
      (element) => element.textContent === label,
    );
    expect(found, `button: ${label}`).toBeDefined();
    return found!;
  };
  const menu = () =>
    host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  const click = async (element: HTMLElement) => {
    await act(async () => element.click());
  };
  const home = () => (
    <HomePage
      branding={branding}
      scopes={undefined}
      multiSession={multiSession}
    />
  );
  const device = async () => {
    window.history.replaceState({}, '', '/device?user_code=ABCD-EFGH');
    await render(
      <DevicePage branding={branding} multiSession={multiSession} />,
    );
  };

  it('refreshes the session before account data after signing out one account', async () => {
    await render(home());
    await eventually(() => expect(menu()).not.toBeNull());
    const refreshed = deferred();
    sessionResponse = refreshed.promise;
    requests = [];

    await click(button('Sign out of this browser'));
    await eventually(() => expect(requests).toContain('/get-session'));
    expect(requests).toEqual(['/multi-session/revoke', '/get-session']);
    expect(active?.user.id).toBe('Mary');

    refreshed.resolve(Response.json(active));
    await eventually(() => {
      expect(host.querySelector('h1')?.textContent).toBe('Mary');
      expect(menu()?.getAttribute('aria-label')).toContain('mary@example.com');
      expect(requests).toContain('/list-sessions');
    });
    expect(requests).not.toContain('/sign-out');
  });

  it('redirects to login after signing out the last account', async () => {
    records = [ada];
    await render(home());
    await eventually(() => expect(menu()).not.toBeNull());
    await click(button('Sign out of this browser'));
    await eventually(() =>
      expect(navigate).toHaveBeenCalledWith({ href: '/login', replace: true }),
    );
    expect(active).toBeNull();
    expect(requests).not.toContain('/sign-out');
  });

  it('uses the account menu to sign out even with only one Signed-in Account', async () => {
    records = [ada];
    await render(home());
    await eventually(() => expect(menu()).not.toBeNull());
    await click(menu()!);
    const signOut = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === 'Sign out');
    expect(signOut).toBeDefined();
    await click(signOut!);
    await eventually(() =>
      expect(navigate).toHaveBeenCalledWith({ href: '/login', replace: true }),
    );
    expect(requests).not.toContain('/sign-out');
    expect(requests).toContain('/multi-session/revoke');
  });

  it('waits for Continue before claiming a device code even with only one Signed-in Account', async () => {
    records = [ada];
    await device();
    await eventually(() => expect(menu()).not.toBeNull());
    expect(requests).not.toContain('/device');
    await click(button('Continue'));
    await eventually(() =>
      expect(host.textContent).toContain('Is this your device?'),
    );
    expect(requests).toContain('/device');
    expect(owner).toBe('Ada');
  });

  it.each(['pending', 'failed'])(
    'disables per-account sign-out when the account list is %s',
    async (status) => {
      const listed = deferred();
      accountResponse =
        status === 'pending'
          ? listed.promise
          : Promise.resolve(
              Response.json({ message: 'Unavailable' }, { status: 500 }),
            );
      await render(home());
      await eventually(() =>
        expect(host.querySelector('h1')?.textContent).toBe('Ada'),
      );
      const signOut = button('Sign out of this browser');
      expect(signOut.disabled).toBe(true);
      await click(signOut);
      expect(requests).not.toContain('/sign-out');
      expect(requests).not.toContain('/multi-session/revoke');

      if (status === 'pending') {
        listed.resolve(Response.json(records));
        await eventually(() =>
          expect(button('Sign out of this browser').disabled).toBe(false),
        );
      }
    },
  );

  it.each([true, false])(
    'claims a prefilled device code only after account selection, then answers %s',
    async (approved) => {
      await device();
      await eventually(() => expect(menu()).not.toBeNull());
      expect(host.querySelector('input')?.value).toBe('ABCD-EFGH');
      expect(requests).not.toContain('/device');

      await click(menu()!);
      const maryItem = [
        ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ].find((item) => item.textContent?.includes('mary@example.com'))!;
      const switching = deferred();
      switchResponse = switching.promise;
      await click(maryItem);
      expect(button('Continue').disabled).toBe(true);
      await act(async () => {
        host
          .querySelector('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          );
      });
      expect(requests).not.toContain('/device');
      switching.resolve(Response.json({}));
      await eventually(() => {
        expect(menu()?.getAttribute('aria-label')).toContain(
          'mary@example.com',
        );
        expect(button('Continue').disabled).toBe(false);
      });

      const lookup = deferred();
      lookupResponse = lookup.promise;
      await click(button('Continue'));
      expect(owner).toBe('Mary');
      expect(menu()).toBeNull();
      lookup.resolve(Response.json({ status: 'pending', client_id: 'demo' }));
      await eventually(() =>
        expect(host.textContent).toContain('Is this your device?'),
      );
      expect(menu()).toBeNull();
      await click(button(approved ? 'Sign in' : 'Deny'));
      await eventually(() =>
        expect(host.textContent).toContain(
          approved ? 'Finishing sign-in' : 'Sign-in denied',
        ),
      );
      expect(requests).toContain(approved ? '/device/approve' : '/device/deny');
      expect(owner).toBe('Mary');
    },
  );

  it('keeps account switching locked when device approval fails', async () => {
    await device();
    await eventually(() => expect(menu()).not.toBeNull());
    await click(button('Continue'));
    await eventually(() =>
      expect(host.textContent).toContain('Is this your device?'),
    );
    answerFails = true;
    await click(button('Sign in'));
    await eventually(() => expect(button('Sign in').disabled).toBe(false));
    expect(menu()).toBeNull();
    expect(host.textContent).toContain('Is this your device?');
    answerFails = false;
    await click(button('Deny'));
    await eventually(() =>
      expect(host.textContent).toContain('Sign-in denied'),
    );
  });

  it('explains when a device code already belongs to another account', async () => {
    owner = 'Mary';
    await device();
    await eventually(() => expect(menu()).not.toBeNull());
    await click(button('Continue'));
    await eventually(() =>
      expect(host.textContent).toContain(
        'This code belongs to another account.',
      ),
    );
    expect(host.textContent).not.toContain('Is this your device?');
    expect(menu()).not.toBeNull();
  });

  it('shows account controls in the ready consent form', async () => {
    window.history.replaceState(
      {},
      '',
      '/consent?client_id=demo&scope=profile',
    );
    await render(
      <ConsentPage
        branding={branding}
        scopes={undefined}
        multiSession={multiSession}
      />,
    );
    await eventually(() =>
      expect(host.textContent).toContain('Allow Demo app to use your account?'),
    );
    await eventually(() => expect(menu()).not.toBeNull());
    await click(menu()!);
    expect(document.body.textContent).toContain('Add another account');
    expect(document.body.textContent).toContain('Sign out');
    expect(document.body.textContent).toContain('mary@example.com');
  });
});
