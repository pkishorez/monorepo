import { Context, Data } from 'effect';
import type { Effect, Scope, Stream } from 'effect';
import type { RpcClient, RpcClientError } from 'effect/rpc';
import type { ConsoleApi } from '../../contracts/console-api/index.ts';
import type { Member } from '../../contracts/member/index.ts';

/*
 * The Capabilities of the Console's pages. Console Provides `Api` and
 * `Session` to every page under it; the app's browser Layer Provides
 * `Browser` to Console. They are declared beside the page definitions,
 * which list them in `requires`, because the router is read from those
 * definitions on the server too; each is built only in the browser.
 */

/** The Console API as one member's tabs call it. */
export type ConsoleClient = RpcClient.FromGroup<
  typeof ConsoleApi,
  RpcClientError.RpcClientError
>;

/** One socket to the signed-in member's User Space. */
export interface Connection {
  readonly client: ConsoleClient;
  /** Runs `open` now and again after every reconnect, until interrupted. */
  readonly subscribe: <A, E>(
    open: () => Stream.Stream<A, E>,
  ) => Stream.Stream<A, E>;
}

/** What a call made while nobody is signed in fails with. */
export class NotSignedIn extends Data.TaggedError('NotSignedIn')<{}> {}

/** What the browser Console runs in gives it: signing in, and a socket for whoever is signed in. */
export class Browser extends Context.Service<
  Browser,
  {
    /** Signs one more account in and makes it active. In Local mode `as`
     * names who; with Google it leaves the page for the Login Screen. */
    readonly signIn: (
      as: {
        readonly email: string;
        readonly name?: string;
      } | null,
    ) => Effect.Effect<void, { readonly message: string }>;
    /** Opens a socket to the Active Account's User Space. */
    readonly connect: Effect.Effect<Connection, never, Scope.Scope>;
  }
>()('alchemy-console/Browser') {}

/**
 * The signed-in member's Console API, which Console Provides to every page.
 * Whoever is signed in is who every call is made as: after an Account
 * Switch, every stream begins again as the new member, on their own socket.
 */
export class Api extends Context.Service<
  Api,
  {
    /** One call, as the member signed in now. */
    readonly call: <A, E>(
      use: (client: ConsoleClient) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | NotSignedIn>;
    /** A live stream, as whoever is signed in: begun again for each new
     * member, after every reconnect, and whenever it ends; nothing while
     * nobody is. */
    readonly follow: <A, E>(
      use: (client: ConsoleClient) => Stream.Stream<A, E>,
    ) => Stream.Stream<A, E>;
  }
>()('alchemy-console/Api') {}

/** Who is signed in, and the Account menu's actions, which Console Provides to every page. */
export class Session extends Context.Service<
  Session,
  {
    /** The member signed in now. */
    readonly member: Effect.Effect<Member, NotSignedIn>;
    /** Makes another signed-in account the active one. */
    readonly switchTo: (userId: string) => Effect.Effect<void>;
    /** Signs one more account in. */
    readonly addAccount: Effect.Effect<void>;
    /** Signs the active account out. */
    readonly signOut: Effect.Effect<void>;
  }
>()('alchemy-console/Session') {}
