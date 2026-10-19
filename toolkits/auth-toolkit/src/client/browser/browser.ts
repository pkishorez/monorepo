import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { localToken } from '../../contract/index.js';
import { bearer, expectUser, Unauthenticated } from '../../guard/index.js';
import {
  type Account,
  Accounts,
  type AccountsState,
} from '../accounts/index.js';
import { makeAccounts, signing } from '../accounts-layer/index.js';
import { browserAccountsTable, type CacheStorage, makeCache } from './cache.js';
import { makeCookieSource } from './cookie-source.js';
import {
  localAccountsTable,
  localChooser,
  type LocalChoice,
  type LocalStorage,
  makeLocalSource,
} from './local-source.js';
import { watchTabs } from './tabs.js';

export { browserAccountsTable, localAccountsTable, localChooser };

/** The Local Token a Local Account signs its calls with, for a Local mode
 * server that must know the visitor before any call, as one that draws the
 * page from a cookie the app keeps. */
export const localTokenOf = (account: Account): string =>
  localToken.make(account);

export type BrowserOptions =
  | {
      /** The Auth Worker's own URL. */
      readonly url: string;
      /** Keeps the last-known Accounts (never tokens), so `state` starts
       * `Checking { last }` and the app can open at once. Not kept unless
       * given. */
      readonly cache?: CacheStorage;
      readonly local?: undefined;
    }
  | {
      /** Local mode: Local Accounts, no Auth Worker. Each call carries the
       * Active Account's Local Token; the backend runs `auth({ local: true
       * })`. */
      readonly local: {
        /** Asks who signs in; null when nobody was chosen. */
        readonly choose: Effect.Effect<LocalChoice | null>;
        /** Where Local Accounts live; in memory unless given. */
        readonly storage?: LocalStorage;
      };
      readonly url?: undefined;
      readonly cache?: undefined;
    };

const notSignedIn = new Unauthenticated({ reason: 'Not signed in' });

/** Who a call acts as: the Active Account, or while Checking the one last
 * seen. With nothing remembered, the call waits for the check. */
const acting = (
  state: AccountsState,
  settle: Effect.Effect<AccountsState, { readonly message: string }>,
): Effect.Effect<Account, Unauthenticated> => {
  if (state._tag === 'SignedIn') return Effect.succeed(state.active);
  if (state._tag === 'SignedOut') return Effect.fail(notSignedIn);
  if (state.last) return Effect.succeed(state.last);
  return settle.pipe(
    Effect.mapError(({ message }) => new Unauthenticated({ reason: message })),
    Effect.flatMap((settled) =>
      settled._tag === 'SignedIn'
        ? Effect.succeed(settled.active)
        : Effect.fail(notSignedIn),
    ),
  );
};

/**
 * `Accounts` for a Browser, and the signing of every guarded call: provide
 * this one Layer to the app.
 *
 * Against the Auth Worker (`url`), the credential is its cookie, which page
 * code never reads: each guarded RPC or HttpApi call goes with the cookie
 * (`credentials: 'include'`, set here; the transport needs nothing) and
 * carries `expect-user` with the Active Account. A call refused with Account
 * Changed checks again before its failure reaches the caller, over RPC (any
 * rpc-toolkit Transport) and HttpApi alike. Checks on start and when the tab
 * becomes visible, and tells other tabs of every change.
 *
 * In Local mode (`local`), Accounts live in a table and each call carries
 * the Active Account's Local Token.
 */
export const browser = (options: BrowserOptions) => {
  const { url, local } = options as { url?: unknown; local?: unknown };
  if (local !== undefined && url !== undefined) {
    throw new Error('browser: give `url` or `local`, not both.');
  }
  if (local !== undefined) {
    if (typeof local !== 'object' || local === null) {
      throw new Error('browser: `local` must be `{ choose }`.');
    }
    return localBrowser(options.local!);
  }
  if (typeof url !== 'string' || url === '') {
    throw new Error("browser: give the Auth Worker's `url`, or `local`.");
  }
  return cookieBrowser({ url, cache: options.cache });
};

const cookieBrowser = ({
  url,
  cache,
}: {
  readonly url: string;
  readonly cache?: CacheStorage | undefined;
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const remembered = cache
        ? yield* makeCache.pipe(Effect.provide(cache))
        : { last: Effect.succeed(null), keep: () => Effect.void };
      const source = yield* makeCookieSource(url);
      const made = yield* makeAccounts({
        source,
        last: yield* remembered.last,
        checkOnStart: true,
        keep: remembered.keep,
        connect: watchTabs(`@kestack/auth-toolkit/accounts ${url}`),
      });

      const signature = made.accounts.current.pipe(
        Effect.flatMap((state) => acting(state, made.settle)),
        Effect.map(({ id }) => expectUser(id)),
      );
      return Layer.mergeAll(
        Layer.succeed(Accounts, made.accounts),
        signing({
          signature,
          refused: 'AccountChanged',
          recheck: made.accounts.check,
          cookie: true,
        }),
      );
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

const localBrowser = ({
  choose,
  storage,
}: {
  readonly choose: Effect.Effect<LocalChoice | null>;
  readonly storage?: LocalStorage | undefined;
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const source = yield* makeLocalSource(choose);
      const made = yield* makeAccounts({
        source,
        last: yield* source.read,
        checkOnStart: false,
        connect: watchTabs('@kestack/auth-toolkit/accounts local'),
      });

      const signature = made.accounts.current.pipe(
        Effect.flatMap((state) => acting(state, made.settle)),
        Effect.map((user) => bearer(localToken.make(user))),
      );
      return Layer.mergeAll(
        Layer.succeed(Accounts, made.accounts),
        signing({
          signature,
          refused: 'Unauthenticated',
          recheck: made.accounts.check,
        }),
      );
    }),
  ).pipe(Layer.provide(storage ?? Memory.make(localAccountsTable).layer));
