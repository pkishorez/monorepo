import { Context, Effect, Layer, Stream } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import { Start } from '@kestack/kabuki/start/server';
import { ConsoleApi } from '../shared/contracts/console-api/index.ts';
import { router, type Visitor } from '../shared/pages/index.ts';
import type { Env } from './host/index.ts';
import { visitorOf } from './host/visitor/index.ts';
import { reach } from './user-space/index.ts';

/*
 * The Loaders, and the visitor they are drawn for, found out once per
 * request: the same session check and Invite list as `/rpc`, then, for an
 * invited member, their own User Space's word on who they are. Data is
 * never read in the Worker: a Loader asks the member's User Space, over its
 * Console API, as the member.
 */

type Client = RpcClient.FromGroup<
  typeof ConsoleApi,
  RpcClientError.RpcClientError
>;

class Visit extends Context.Service<
  Visit,
  {
    readonly visitor: typeof Visitor.Type;
    /** Asks the member's User Space, as them; null for anyone Console turns away. */
    readonly ask:
      | (<A, E>(
          use: (client: Client) => Effect.Effect<A, E>,
        ) => Effect.Effect<A>)
      | null;
  }
>()('alchemy-console/Loaders/Visit') {}

const visit = (env: Env, request: Request) =>
  Layer.effect(
    Visit,
    Effect.gen(function* () {
      const { visit: visited, cookies } = yield* Effect.promise(() =>
        visitorOf(request, env.CONSOLE_INVITES),
      );
      // Sign-in cookies the Auth Worker refreshed go on the page.
      const headers = yield* Start.ResponseHeaders;
      for (const cookie of cookies) yield* headers.append('set-cookie', cookie);
      if (visited._tag !== 'Admitted') return { visitor: visited, ask: null };
      const api = reach(env.USER_SPACE, visited).api;
      const ask = <A, E>(use: (client: Client) => Effect.Effect<A, E>) =>
        Effect.flatMap(RpcClient.make(ConsoleApi), use).pipe(
          Effect.scoped,
          Effect.provide(api),
          Effect.orDie,
        );
      const member = yield* ask((client) => client['Session.me']());
      return { visitor: { _tag: 'SignedIn' as const, member }, ask };
    }),
  );

const loaders = router.loaders({
  Console: () => Effect.map(Visit, ({ visitor }) => visitor),
  'Console.Welcome': () =>
    Effect.map(Visit, ({ visitor }) => ({
      member: visitor._tag === 'SignedIn' ? visitor.member : null,
    })),
  'Console.Settings': () =>
    Effect.gen(function* () {
      const { ask } = yield* Visit;
      if (ask === null) return { credentials: null };
      const credentials = yield* ask((client) =>
        Stream.runHead(client['Credentials.list']()),
      );
      return {
        credentials: credentials._tag === 'Some' ? credentials.value : [],
      };
    }),
});

export default Start.layers<Env>()
  .visitor(({ env, request }) => visit(env, request))
  .loaders(loaders);
