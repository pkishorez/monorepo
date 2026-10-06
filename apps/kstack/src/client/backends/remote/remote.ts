import { Effect, Layer } from 'effect';
import { authLive } from '@kstackz/auth-toolkit/clients/auth';
import { browser } from '@kstackz/std-toolkit/sync/platform/browser';
import { FetchHttpClient } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Device, Sessions } from '../../domain/machine/index.ts';
import type { User } from '../../domain/session/index.ts';
import { reconcileCopies } from '../../state/local-copies/index.ts';
import { openSessions } from '../../state/session/index.ts';
import { AUTH_URL } from './auth-url.ts';

// localStorage: the User last opened on this device, to open offline.
const LAST_USER = 'ledger:last-user';

const readLastUser = (): User | null => {
  try {
    const stored = localStorage.getItem(LAST_USER);
    return stored === null ? null : (JSON.parse(stored) as User);
  } catch {
    return null;
  }
};

const deviceRemote = Layer.succeed(Device, {
  lastUser: Effect.sync(readLastUser),
  setLastUser: (user) =>
    Effect.sync(() =>
      user === null
        ? localStorage.removeItem(LAST_USER)
        : localStorage.setItem(LAST_USER, JSON.stringify(user)),
    ),
  keepCopies: (userIds) =>
    Effect.tryPromise(() => reconcileCopies(userIds)).pipe(
      Effect.catch((error) => Effect.logWarning('[copies]', error)),
      Effect.asVoid,
    ),
});

// The Ledger API at this origin's `/rpc`. A call carries its Session's token
// and never the cookie, which names whoever is active in the browser.
const connection = Layer.suspend(() =>
  RpcClient.layerProtocolHttp({
    url: new URL('/rpc', window.location.origin).href,
  }),
).pipe(
  Layer.provide([
    FetchHttpClient.layer.pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.RequestInit, { credentials: 'omit' }),
      ),
    ),
    RpcSerialization.layerNdjson,
  ]),
);

/**
 * The Remote Backend, as the app machine needs it: Users signed in with
 * Google through the Auth Worker, and each Session over HTTP with its copy
 * kept in IndexedDB, to open offline.
 */
export const remoteBackend = Layer.mergeAll(
  authLive({ authWorkerUrl: AUTH_URL }),
  deviceRemote,
  Layer.sync(Sessions, () => ({
    open: openSessions({ connection, platform: browser() }),
  })),
);
