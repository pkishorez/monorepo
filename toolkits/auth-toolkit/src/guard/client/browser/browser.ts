import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { expectUser } from '../../authz/middleware/index.js';
import { Accounts, type AccountsLayer } from '../accounts/index.js';
import { acting, makeAccounts, signing, watchTabs } from '../engine/index.js';
import { browserAccountsTable, type CacheStorage, makeCache } from './cache.js';
import { makeCookieSource } from './cookie-source.js';

export { browserAccountsTable };

export interface BrowserOptions {
  /** The Auth Worker's own URL. */
  readonly url: string;
  /** Remembers the Accounts last signed in (never tokens), so `state`
   * starts `Checking { last }` and the app can open at once. A signed-out
   * answer keeps them, unless it is to that first check or follows a
   * sign-out asked here. Not kept unless given. */
  readonly cache?: CacheStorage;
}

/** Throws unless `options` name the Auth Worker's `url`. */
const checkOptions = ({ url }: BrowserOptions) => {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error("browser: give the Auth Worker's `url`.");
  }
};

/**
 * `Accounts` for a Browser, and the signing of every guarded call: provide
 * this one Layer to the app.
 *
 * The credential is the Auth Worker's cookie, which page code never reads:
 * each guarded RPC or HttpApi call goes with the cookie (`credentials:
 * 'include'`, set here; the transport needs nothing) and carries
 * `expect-user` with the Active Account. A call refused with Account
 * Changed checks again before its failure reaches the caller, over RPC (any
 * rpc-toolkit Transport) and HttpApi alike. Checks on start and when the tab
 * becomes visible, and tells other tabs of every change.
 *
 * `signIn()` leaves for the Login Screen; `signIn({ test: { email, key? }
 * })` signs a Test User in at once, where the Auth Worker allows it.
 */
export const browser = (options: BrowserOptions): AccountsLayer => {
  checkOptions(options);
  const { url, cache } = options;
  return Layer.unwrap(
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
};
