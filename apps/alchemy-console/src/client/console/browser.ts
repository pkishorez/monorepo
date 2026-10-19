import { Context, Effect, Fiber, Layer, Stream } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import {
  browser,
  localAccountsTable,
  localChooser,
  localTokenOf,
} from '@kestack/auth-toolkit/client/browser';
import { Rpc } from '@kestack/rpc-toolkit/rpc';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { ConsoleApi } from '../../shared/contracts/console-api/index.ts';
import { LOCAL_SESSION_COOKIE } from '../../shared/contracts/local-session/index.ts';
import { Browser } from '../../shared/pages/index.ts';

/*
 * The browser Console runs in: its Accounts, and the `Browser` Console
 * Requires, as one Layer for the app. Which sign-in is fixed at build time,
 * as the Worker's is: the Auth Worker's URL, or Local mode.
 *
 * - Google: the Auth Worker's cookie, which page code never reads, goes
 *   with every page load and every socket upgrade.
 * - Local mode: Local Accounts kept in IndexedDB, so a reload stays signed
 *   in; the Active Account's Local Token is kept in a cookie of Console's
 *   own, written before anyone hears of a change, so the Worker always
 *   knows the visitor the browser does.
 */

const authUrl = import.meta.env.VITE_CONSOLE_AUTH_URL ?? '';

/** How a visitor signs in, the same in the Worker's drawing and the browser's. */
export const signInMode: 'google' | 'local' =
  authUrl === '' ? 'local' : 'google';

// As long as the Local Accounts it mirrors, which IndexedDB keeps: renewed
// each time the browser hears of them, so the Worker never draws a visitor
// signed out whom the browser still has signed in.
const KEPT_SECONDS = 400 * 24 * 60 * 60;

const keepLocalSession = (state: AccountsState) =>
  Effect.sync(() => {
    if (state._tag === 'Checking') return;
    document.cookie =
      state._tag === 'SignedIn'
        ? `${LOCAL_SESSION_COOKIE}=${encodeURIComponent(localTokenOf(state.active))}; Path=/; SameSite=Lax; Max-Age=${KEPT_SECONDS}`
        : `${LOCAL_SESSION_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  });

/** Local mode's Accounts: every state it gives first kept in the cookie. */
const localAccounts = (choose: Effect.Effect<{ email: string } | null>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const context = yield* Layer.build(
        browser({
          local: {
            choose,
            storage: IDB.make(localAccountsTable, {
              database: IDB.database({ databaseName: 'alchemy-console' }),
            }).layer,
          },
        }),
      );
      const accounts = Context.get(context, Accounts);
      return Layer.succeedContext(
        Context.add(context, Accounts, {
          ...accounts,
          state: accounts.state.pipe(Stream.tap(keepLocalSession)),
        }),
      );
    }),
  );

/** A socket to the Active Account's User Space, signed as the browser signs every call. */
const connect = (signing: Context.Context<never>) =>
  Effect.gen(function* () {
    const socket = yield* Layer.build(
      Rpc.websocket.client(ConsoleApi, { url: '/rpc' }),
    );
    const client = yield* RpcClient.make(ConsoleApi).pipe(
      Effect.provideContext(Context.merge(signing, socket)),
    );
    return {
      client,
      subscribe: <A, E>(open: () => Stream.Stream<A, E>) =>
        Rpc.websocket.keepSubscribed(open).pipe(Stream.provideContext(socket)),
    };
  });

type SignIn = Browser['Service']['signIn'];

// `signing` is everything the Accounts Layer gives: the Accounts, and the
// signing of every guarded call, which a socket's client must carry.
const browserOf = (signInWith: (accounts: Accounts['Service']) => SignIn) =>
  Layer.effect(
    Browser,
    Effect.map(Effect.context<Accounts>(), (signing) =>
      Browser.of({
        signIn: signInWith(Context.get(signing, Accounts)),
        connect: connect(signing as Context.Context<never>),
      }),
    ),
  );

/** Signing in with Google, through the Auth Worker's Login Screen. */
export const googleBrowser = () =>
  browserOf((accounts) => () => accounts.signIn()).pipe(
    Layer.provideMerge(browser({ url: authUrl })),
  );

/** Local mode: whoever the visitor types, asking no one. */
export const localBrowser = () => {
  const chooser = localChooser();
  return browserOf(
    (accounts) => (as) =>
      Effect.gen(function* () {
        const signingIn = yield* Effect.forkChild(accounts.signIn());
        while (!chooser.isAsking()) yield* Effect.yieldNow;
        chooser.answer(as);
        yield* Fiber.join(signingIn);
      }),
  ).pipe(Layer.provideMerge(localAccounts(chooser.choose)));
};
