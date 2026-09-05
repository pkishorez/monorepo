import { Effect, Ref, Schema } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import {
  Rpc,
  RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import { Authz } from 'auth-toolkit/rpc';
import { authzCookies } from 'auth-toolkit/rpc/server';
import { authLayer, resolvedAuth, runRpc } from '../support.js';

const GetProfile = Rpc.make('GetProfileForBatch', {
  payload: {},
  success: Schema.String,
});

const ListNotifications = Rpc.make('ListNotifications', {
  payload: {},
  success: Schema.String,
});

const Api = Authz.guard()(RpcGroup.make(GetProfile, ListNotifications));

const Handlers = Api.toLayer({
  GetProfileForBatch: () =>
    Effect.map(Authz.CurrentAuth, ({ user }) => user.id),
  ListNotifications: () => Effect.map(Authz.CurrentAuth, ({ user }) => user.id),
});

const batchRequest = new Request('https://api.example.com/rpc', {
  method: 'POST',
  headers: { cookie: 'session=OLD' },
  body: JSON.stringify([
    {
      _tag: 'Request',
      id: 'profile',
      tag: 'GetProfileForBatch',
      payload: {},
      headers: [],
    },
    {
      _tag: 'Request',
      id: 'notifications',
      tag: 'ListNotifications',
      payload: {},
      headers: [],
    },
  ]),
});

const RpcHttpApp = Effect.gen(function* () {
  const rpcApp = yield* RpcServer.toHttpEffect(Api);
  return yield* authzCookies(rpcApp);
});

export const handlingCallsTogether = Story.make({
  title: 'Handling calls together',
  description:
    'Verify an HTTP batch once while keeping simultaneous requests isolated.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How often is one batched RPC request verified?', {
      answer:
        'Once. Both calls receive the same Current Auth, and the HTTP response carries every refreshed cookie. Relay is keyed by cookie name, so same-name cookies collapse to the last one.',
      proof: Story.trace(
        Effect.gen(function* () {
          const verificationCount = yield* Ref.make(0);
          const TestAuth = authLayer(() =>
            Ref.updateAndGet(verificationCount, (count) => count + 1).pipe(
              Effect.as(
                resolvedAuth('user-1', [
                  'session=NEW; Path=/; HttpOnly',
                  'session_cache=NEW; Path=/; HttpOnly',
                ]),
              ),
            ),
          );

          const response = yield* RpcHttpApp.pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(batchRequest),
            ),
            Effect.provide(Handlers),
            Effect.provide(TestAuth),
            Effect.provide(RpcSerialization.layerJson),
            Effect.scoped,
          );

          const verifications = yield* Ref.get(verificationCount);
          const cookies =
            HttpServerResponse.toWeb(response).headers.getSetCookie();

          yield* Story.assert(
            'the whole batch verifies once',
            verifications === 1,
          );
          yield* Story.assert(
            'every distinctly named refreshed cookie is relayed',
            cookies.length === 2,
          );
          return { verifications, cookies };
        }),
      ),
    }),
    Story.question('Can simultaneous requests leak Current Auth?', {
      answer:
        'No. Each request resolves and receives its own Current Auth, even when both run concurrently.',
      proof: Story.trace(
        Effect.gen(function* () {
          const TestAuth = authLayer((request) => {
            const userId = request.headers.get('cookie')?.replace('user=', '');
            return Effect.sleep('10 millis').pipe(
              Effect.as(resolvedAuth(userId ?? 'unknown')),
            );
          });

          const identities = yield* Effect.all(
            [
              runRpc(
                Api,
                Handlers,
                (client) =>
                  client.GetProfileForBatch(
                    {},
                    { headers: { cookie: 'user=alice' } },
                  ),
                TestAuth,
              ),
              runRpc(
                Api,
                Handlers,
                (client) =>
                  client.ListNotifications(
                    {},
                    { headers: { cookie: 'user=bob' } },
                  ),
                TestAuth,
              ),
            ],
            { concurrency: 'unbounded' },
          );

          yield* Story.assert(
            'each request keeps its own identity',
            identities.join(',') === 'alice,bob',
          );
          return { identities };
        }),
      ),
    }),
  ],
});
