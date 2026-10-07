import { Effect } from 'effect';
import {
  Auth,
  type LoginError,
  type SignedInAccount,
  Unreachable,
} from '../service/index.js';
import type { Device } from './device.js';
import { type Entry, keychain } from './keychain.js';
import { OAuthRefused, tokenEndpoint } from './token-endpoint.js';

export interface AuthExpoConfig {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** The app's First-Party client id in the Auth Worker's config. */
  clientId: string;
  /** One of the client's redirect URIs, e.g. `ledger://oauth/callback`. */
  redirectUri: string;
  /** The Resource Server the app calls with these Access Tokens. */
  resource: string;
  /** Prefix of the secure-storage keys. @default 'auth' */
  storageKey?: string | undefined;
}

interface Environment {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

/** Refresh an Access Token this long before it expires. */
const REFRESH_MARGIN_MS = 60_000;

/** Each User's refresh in flight, by storage key and User, shared by every
 * Auth built on this device so two never spend the same refresh token. */
const refreshing = new Map<string, Promise<Entry | null>>();

const unreachable = (cause: unknown) =>
  new Unreachable({
    reason: cause instanceof Error ? cause.message : String(cause),
  });

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: unreachable });

/** The User an Access Token names (its `sub`), read without verifying: the
 * token only ever came from this device's own entries. */
const subjectOf = (token: string): string | null => {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { sub } = JSON.parse(json) as { sub?: unknown };
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
};

/** Auth for a phone: each User signs in as the app's First-Party OAuth
 * client in the system sign-in sheet and keeps their own tokens in secure
 * storage. */
export const makeAuth = (
  config: AuthExpoConfig,
  device: Device,
  environment: Environment = {
    fetch: (...args) => fetch(...args),
    now: Date.now,
  },
) => {
  const oauth = tokenEndpoint({ ...config, ...environment });
  const storageKey = config.storageKey ?? 'auth';
  const users = keychain(device.secrets, storageKey);
  let loginError: LoginError | null = null;

  // A refresh token works once, and using a spent one revokes the User's
  // whole chain, so a User's refreshes never overlap, and each starts from
  // what is stored now, not from an entry read before another refresh.
  const refresh = (entry: Entry) => {
    const key = `${storageKey}:${entry.user.id}`;
    const running = refreshing.get(key);
    if (running) return running;
    const next = (async (): Promise<Entry | null> => {
      const stored = await users.entry(entry.user.id);
      if (stored === null) return null;
      if (stored.expiresAt - environment.now() > REFRESH_MARGIN_MS)
        return stored;
      try {
        const tokens = await oauth.refresh(stored.refreshToken);
        const fresh = { ...stored, ...tokens };
        await users.update(fresh);
        return fresh;
      } catch (error) {
        if (!(error instanceof OAuthRefused)) return stored;
        // Revoked, expired, or reused elsewhere: this User is signed out.
        await users.remove(stored.user.id);
        return null;
      }
    })().finally(() => refreshing.delete(key));
    refreshing.set(key, next);
    return next;
  };

  const fresh = async (entry: Entry) =>
    entry.expiresAt - environment.now() > REFRESH_MARGIN_MS
      ? entry
      : refresh(entry);

  const entries = async () => {
    const { users: ids } = await users.roster();
    const stored = await Promise.all(ids.map((id) => users.entry(id)));
    return stored.filter((entry): entry is Entry => entry !== null);
  };

  const entryFor = async (token: string) => {
    const id = subjectOf(token);
    const all = await entries();
    return (
      all.find((entry) => entry.user.id === id) ??
      all.find((entry) => entry.accessToken === token) ??
      null
    );
  };

  const signOutOf = async (entry: Entry) => {
    try {
      await oauth.revoke(entry.refreshToken);
    } catch (error) {
      // Already revoked or spent: nothing left to revoke.
      if (!(error instanceof OAuthRefused)) throw error;
    }
    await users.remove(entry.user.id);
  };

  const signIn = async () => {
    const authorized = await device.authorize({
      authorizationEndpoint: oauth.authorizationEndpoint,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: SCOPES,
      // `login` shows the Login Screen even when the sheet's browser is
      // signed in already, so Add User can choose someone else.
      params: { resource: config.resource, prompt: 'login' },
    });
    if (authorized.type === 'cancelled') return;
    if (authorized.type === 'error') {
      loginError = {
        code: authorized.code,
        ...(authorized.description
          ? { description: authorized.description }
          : {}),
      };
      return;
    }
    const tokens = await oauth.exchange(
      authorized.code,
      authorized.codeVerifier,
      config.redirectUri,
    );
    const user = await oauth.userInfo(tokens.accessToken);
    const previous = await users.entry(user.id);
    await users.add({ user, ...tokens });
    if (previous) {
      await oauth.revoke(previous.refreshToken).catch(() => undefined);
    }
  };

  return Auth.of({
    list: attempt(async () => {
      const { active } = await users.roster();
      const current = await Promise.all((await entries()).map(fresh));
      return current
        .filter((entry): entry is Entry => entry !== null)
        .map((entry): SignedInAccount => ({
          user: entry.user,
          token: entry.accessToken,
          active: entry.user.id === active,
        }));
    }),
    signIn: () => attempt(signIn),
    switchTo: (token) =>
      attempt(async () => {
        const entry = await entryFor(token);
        if (entry) await users.activate(entry.user.id);
      }),
    signOut: (token) =>
      attempt(async () => {
        const entry = await entryFor(token);
        if (entry) await signOutOf(entry);
      }),
    signOutAll: attempt(async () => {
      for (const entry of await entries()) await signOutOf(entry);
    }),
    takeLoginError: Effect.sync(() => {
      const error = loginError;
      loginError = null;
      return error;
    }),
  });
};
