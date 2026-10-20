import { Context, Effect, Layer, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
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

type Ask = NonNullable<Visit['Service']['ask']>;

/** The first list a stream of lists gives; none when it gives none. */
const first = <A>(
  ask: Ask,
  open: (client: Client) => Stream.Stream<ReadonlyArray<A>, unknown>,
) =>
  Effect.map(
    ask((client) => Stream.runHead(open(client))),
    (head): ReadonlyArray<A> => (head._tag === 'Some' ? head.value : []),
  );

const loaders = router.loaders({
  Console: () => Effect.map(Visit, ({ visitor }) => visitor),
  'Console.Welcome': () =>
    Effect.gen(function* () {
      const { visitor, ask } = yield* Visit;
      if (visitor._tag !== 'SignedIn' || ask === null)
        return { member: null, connections: null, projects: null };
      const [connections, projects] = yield* Effect.all(
        [
          first(ask, (client) => client['Connections.list']()),
          first(ask, (client) => client['Projects.list']()),
        ],
        { concurrency: 2 },
      );
      return { member: visitor.member, connections, projects };
    }),
  'Console.NewProject': () =>
    Effect.gen(function* () {
      const { ask } = yield* Visit;
      if (ask === null) return { repositories: null, credentials: null };
      const [repositories, credentials] = yield* Effect.all(
        [
          first(ask, (client) => client['Repositories.list']()),
          first(ask, (client) => client['Credentials.list']()),
        ],
        { concurrency: 2 },
      );
      return { repositories, credentials };
    }),
  'Console.Project': ({ projectId }) =>
    Effect.gen(function* () {
      const { ask } = yield* Visit;
      if (ask === null) return null;
      const head = yield* ask((client) =>
        Stream.runHead(client['Projects.get']({ projectId })).pipe(
          // Not the member's, or no such project: the same to them.
          Effect.catchTag('ProjectError', () => Effect.succeedNone),
        ),
      );
      if (head._tag === 'None') return yield* Effect.fail(Page.notFound());
      return head.value;
    }),
  'Console.Settings': () =>
    Effect.gen(function* () {
      const { ask } = yield* Visit;
      if (ask === null) return { connections: null, credentials: null };
      const [connections, credentials] = yield* Effect.all(
        [
          first(ask, (client) => client['Connections.list']()),
          first(ask, (client) => client['Credentials.list']()),
        ],
        { concurrency: 2 },
      );
      return { connections, credentials };
    }),
});

export default Start.layers<Env>()
  .visitor(({ env, request }) => visit(env, request))
  .loaders(loaders);
