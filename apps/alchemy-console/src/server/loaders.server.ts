import { Context, Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
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

class Visit extends Context.Service<Visit, typeof Visitor.Type>()(
  'alchemy-console/Loaders/Visit',
) {}

const visit = (env: Env, request: Request) =>
  Layer.effect(
    Visit,
    Effect.gen(function* () {
      const visited = yield* Effect.promise(() =>
        visitorOf(request, env.CONSOLE_INVITES),
      );
      if (visited._tag !== 'Admitted') return visited;
      const member = yield* Effect.gen(function* () {
        const api = yield* RpcClient.make(ConsoleApi);
        return yield* api['Session.me']();
      }).pipe(
        Effect.scoped,
        Effect.provide(reach(env.USER_SPACE, visited).api),
        Effect.orDie,
      );
      return { _tag: 'SignedIn' as const, member };
    }),
  );

const loaders = router.loaders({
  Console: () => Visit,
  'Console.Welcome': () =>
    Effect.map(Visit, (visitor) => ({
      member: visitor._tag === 'SignedIn' ? visitor.member : null,
    })),
});

export default Start.layers<Env>()
  .visitor(({ env, request }) => visit(env, request))
  .loaders(loaders);
