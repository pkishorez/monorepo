import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { Loading } from '@kestack/kabuki/routing/capabilities';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import {
  Api,
  ApiError,
  isTestEmail,
  pagesData,
  signedOAuthQuery,
} from '../../api/index.ts';
import type { Account, DeviceRequest, Grant, SignIn } from '../../api/index.ts';
import { AppLive } from '../actor.ts';
import { router } from '../routes.ts';

/*
 * The pages running in memory, as in a browser tab: the Router, the Data
 * cache and every page's Workers, over Loaders that read a pretend Auth
 * Worker and an Api that answers from it. Another tab is a change to the
 * Auth Worker's state, then `shown()`.
 */

export const ada: Account = {
  id: 'ada',
  email: 'ada@acme.dev',
  name: 'Ada',
  image: null,
};
export const grace: Account = {
  id: 'grace',
  email: 'grace@acme.dev',
  name: 'Grace',
  image: null,
};

const signIn = (id: string, current: boolean): SignIn => ({
  id,
  name: current ? 'Chrome on macOS' : `acme-cli on ${id}`,
  kind: current ? 'browser' : 'device',
  current,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastActiveAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-11-01T00:00:00.000Z',
});

/** What the pretend Auth Worker holds: this browser's Accounts, each one's Sign-ins and Grants. */
export interface Server {
  active: string | null;
  accounts: Array<Account>;
  signIns: Record<string, Array<SignIn>>;
  grants: Record<string, Array<Grant>>;
  devices: Record<string, DeviceRequest>;
}

export const twoAccounts = (): Server => ({
  active: ada.id,
  accounts: [ada, grace],
  signIns: {
    ada: [signIn('ada-here', true), signIn('ada-laptop', false)],
    grace: [signIn('grace-here', true), signIn('grace-laptop', false)],
  },
  grants: { ada: [], grace: [] },
  devices: {},
});

/** With `testKey`, Test Sign-In is on, asking for that key if it is a string. */
export const harness = (
  server: Server,
  { testKey }: { testKey?: string | null } = {},
) => {
  const env = pagesData({
    brand: { name: 'Acme' },
    maxAccounts: 5,
    cookieDomain: 'acme.localhost',
    origin: 'http://auth.acme.localhost',
    ...(testKey !== undefined ? { testUsers: { key: testKey !== null } } : {}),
    reads: undefined as never,
  });
  const calls: Record<string, number> = {};
  const gates: Record<string, Promise<void>> = {};
  const listeners = new Set<() => void>();
  let location = { pathname: '/', search: '', origin: env.origin };
  const left: Array<string> = [];
  /** Answers of the Api's actions, held until opened: `hold('revokeOthers')`. */
  const held: Record<string, Promise<void>> = {};

  const accounts = () => ({
    active: server.accounts.some(({ id }) => id === server.active)
      ? server.active
      : null,
    list: [...server.accounts],
  });
  /** A Loader: reads the Auth Worker as it is asked, then waits on its gate. */
  const loader = <A>(name: string, read: () => A) =>
    Effect.suspend(() => {
      calls[name] = (calls[name] ?? 0) + 1;
      const data = read();
      return Effect.promise(() => gates[name] ?? Promise.resolve()).pipe(
        Effect.as(data),
      );
    });
  const page = () => ({ ...env, accounts: accounts() });

  const loaders = router.loaders({
    Home: () =>
      Effect.flatMap(
        loader('Home', () => {
          const data = page();
          const active = data.accounts.active;
          return active
            ? {
                ...data,
                signIns: [...(server.signIns[active] ?? [])],
                grants: [...(server.grants[active] ?? [])],
              }
            : undefined;
        }),
        (data) =>
          data
            ? Effect.succeed(data)
            : Effect.fail(Page.redirect(router.Login({ return_to: '/' }))),
      ),
    // An authorization it continues is named by its signed query alone.
    Login: (query) =>
      loader('Login', () => ({
        ...page(),
        continuing: signedOAuthQuery(query.search ?? '') ? 'Notes' : null,
      })),
    Device: (query) =>
      loader('Device', () => {
        const code = query.code ?? query.user_code;
        const found = code ? server.devices[code] : undefined;
        return {
          ...page(),
          lookup: !code
            ? null
            : found
              ? { _tag: 'Found' as const, ...found }
              : {
                  _tag: 'Failed' as const,
                  code: 'invalid_code',
                  message: 'No such code',
                },
        };
      }),
    Consent: (query) =>
      loader('Consent', () => {
        const signed = signedOAuthQuery(query.search ?? '');
        return {
          ...page(),
          request: signed
            ? {
                _tag: 'Found' as const,
                client: { id: 'notes', name: 'Notes', icon: null, uri: null },
                scopes: [],
                query: query.search ?? '',
              }
            : { _tag: 'Invalid' as const, message: 'Unsigned.' },
        };
      }),
    Error: () => loader('Error', page),
  });

  const changed = (userId: string) =>
    server.active === userId
      ? Effect.void
      : Effect.fail(
          new ApiError({
            status: 409,
            code: 'account_changed',
            message: 'That account is no longer active here.',
          }),
        );
  const waitFor = (name: string) =>
    Effect.promise(() => held[name] ?? Promise.resolve());

  const api = Layer.succeed(Api, {
    accounts: Effect.sync(() => {
      const { active, list } = accounts();
      return { active, accounts: list };
    }),
    switchTo: (userId) =>
      Effect.andThen(waitFor('switchTo'), () =>
        server.accounts.some(({ id }) => id === userId)
          ? Effect.sync(() => {
              server.active = userId;
              return { active: userId };
            })
          : Effect.fail(
              new ApiError({
                status: 403,
                code: 'not_signed_in',
                message: 'That account is not signed in on this browser.',
              }),
            ),
      ),
    signOut: (userId) =>
      Effect.sync(() => {
        server.accounts = server.accounts.filter(({ id }) => id !== userId);
        if (server.active === userId)
          server.active = server.accounts[0]?.id ?? null;
        return { active: server.active };
      }),
    signOutAll: Effect.sync(() => {
      server.accounts = [];
      server.active = null;
    }),
    revokeSignIn: (id, userId) =>
      Effect.andThen(changed(userId), waitFor('revokeSignIn')).pipe(
        Effect.map(() => {
          server.signIns[userId] = (server.signIns[userId] ?? []).filter(
            (each) => each.id !== id,
          );
        }),
      ),
    revokeOtherSignIns: (userId) =>
      Effect.andThen(changed(userId), waitFor('revokeOthers')).pipe(
        Effect.map(() => {
          const before = server.signIns[userId] ?? [];
          server.signIns[userId] = before.filter((each) => each.current);
          return before.length - server.signIns[userId].length;
        }),
      ),
    revokeGrant: (id, userId) =>
      Effect.andThen(changed(userId), waitFor('revokeGrant')).pipe(
        Effect.map(() => {
          server.grants[userId] = (server.grants[userId] ?? []).filter(
            (each) => each.id !== id,
          );
        }),
      ),
    deviceAnswer: ({ userCode, approve }) =>
      Effect.suspend(() => {
        const found = server.devices[userCode];
        if (!found)
          return Effect.fail(
            new ApiError({
              status: 400,
              code: 'expired_code',
              message: 'That code expired.',
            }),
          );
        server.devices[userCode] = {
          ...found,
          status: approve ? 'approved' : 'denied',
        };
        return Effect.succeed(
          approve ? ('approved' as const) : ('denied' as const),
        );
      }),
    consentAnswer: () => Effect.succeed('https://client.example/callback'),
    google: () => Effect.succeed('https://accounts.google.com/o/oauth2'),
    testSignIn: ({ email, key, oauthQuery }) =>
      Effect.suspend(() => {
        if (!isTestEmail(email))
          return Effect.fail(
            new ApiError({
              status: 400,
              code: 'not_a_test_email',
              message: 'Not a test email.',
            }),
          );
        if (testKey && key !== testKey)
          return Effect.fail(
            new ApiError({
              status: 401,
              code: 'wrong_key',
              message: 'That test key is not right.',
            }),
          );
        const id = email.split('@')[0]!;
        if (!server.accounts.some((account) => account.id === id))
          server.accounts.push({ id, email, name: id, image: null });
        server.active = id;
        return Effect.succeed(
          oauthQuery ? 'https://auth.acme.localhost/consent' : undefined,
        );
      }),
    location: Effect.sync(() => location),
    leave: (url) => Effect.sync(() => void left.push(url)),
    onShown: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });

  const Root = Router.app(
    router,
    View.make(AppLive, () => null),
  );
  const loading = Loading.cached(router, Loading.memory(router, loaders));

  /** The app, opened at `path` as a tab would: its data loads once it runs. */
  const open = (path = '/') =>
    Runtime.start(
      History.make(Root.actor, { input: Root.startAt(path) }),
      Layer.mergeAll(loading, api),
    );

  return {
    server,
    calls,
    left,
    open,
    /** This tab is shown again, as after another tab. */
    shown: () => {
      for (const listener of listeners) listener();
    },
    /** Holds a Loader's answer back until the returned function is called. */
    hold: (name: string) => {
      let release!: () => void;
      gates[name] = new Promise((done) => (release = done));
      return () => {
        delete gates[name];
        release();
      };
    },
    /** Holds an Api action's answer back until the returned function is called. */
    holdAction: (name: string) => {
      let release!: () => void;
      held[name] = new Promise((done) => (release = done));
      return () => {
        delete held[name];
        release();
      };
    },
    at: (next: typeof location) => {
      location = next;
    },
  };
};

export const wait = (ms: number) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));
/** Long enough for any move or reload to land, held or not. */
export const settle = wait(400);

export const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
export const find = (app: Running<unknown>, name: string) =>
  walk(app.snapshot()).find((each) => each.actor === name);

/** The data the page `name` shows, if it is Ready. */
export const shownData = <D = Record<string, any>>(
  app: Running<unknown>,
  name: string,
) => {
  const status = (
    find(app, name)?.props as
      | { readonly status?: { readonly _tag: string; readonly data?: D } }
      | undefined
  )?.status;
  return status?._tag === 'Ready' ? status.data : undefined;
};

/** Sends the page `name` a Message. */
export const sendTo = (
  app: Running<unknown>,
  name: string,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) => app.send(find(app, name)!.id, message);

/** Sends the Router a Message: `{ _tag: 'Pushed', route }`, `{ _tag: 'Went', by: -1 }`. */
export const sendRouter = (
  app: Running<unknown>,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) => app.send('Router', message);
