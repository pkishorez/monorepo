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

const GetSettings = Rpc.make('GetSettings', {
  payload: {},
  success: Schema.String,
}).pipe(Authz.guard());

const SettingsApi = RpcGroup.make(GetSettings);
const SettingsHandlers = SettingsApi.toLayer({
  GetSettings: () => Effect.succeed('Settings'),
});

const DeleteWorkspace = Rpc.make('DeleteWorkspaceAtEdge', {
  payload: {},
  success: Schema.Void,
}).pipe(
  Authz.guard(
    Authz.policy(({ user }) => user.id === 'admin', 'Administrator required'),
  ),
);

const AdminApi = Authz.guard()(RpcGroup.make(DeleteWorkspace));
const AdminHandlers = AdminApi.toLayer({
  DeleteWorkspaceAtEdge: () => Effect.void,
});

const GetAccount = Rpc.make('GetAccountAtEdge', {
  payload: {},
  success: Schema.Void,
});
const ListTeams = Rpc.make('ListTeamsAtEdge', {
  payload: {},
  success: Schema.Void,
});
const BatchApi = Authz.guard()(RpcGroup.make(GetAccount, ListTeams));
const BatchHandlers = BatchApi.toLayer({
  GetAccountAtEdge: () => Effect.void,
  ListTeamsAtEdge: () => Effect.void,
});

const makeBatchRequest = () =>
  new Request('https://api.example.com/rpc', {
    method: 'POST',
    headers: { cookie: 'session=OLD' },
    body: JSON.stringify([
      {
        _tag: 'Request',
        id: 'account',
        tag: 'GetAccountAtEdge',
        payload: {},
        headers: [],
      },
      {
        _tag: 'Request',
        id: 'teams',
        tag: 'ListTeamsAtEdge',
        payload: {},
        headers: [],
      },
    ]),
  });

const WrappedRpcApp = Effect.gen(function* () {
  const rpcApp = yield* RpcServer.toHttpEffect(BatchApi);
  return yield* authzCookies(rpcApp);
});

const UnwrappedRpcApp = RpcServer.toHttpEffect(BatchApi).pipe(Effect.flatten);

const runHttpApp = (
  app: typeof WrappedRpcApp,
  authentication: ReturnType<typeof authLayer>,
) =>
  app.pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(makeBatchRequest()),
    ),
    Effect.provide(BatchHandlers),
    Effect.provide(authentication),
    Effect.provide(RpcSerialization.layerJson),
    Effect.scoped,
    Effect.map(HttpServerResponse.toWeb),
  );

export const rpcEdgeCases = Story.make({
  title: 'RPC edge cases',
  description:
    'Keep failures typed, preserve specific policies, and control cookie relay at the HTTP boundary.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Is no session different from a broken verifier?', {
      answer:
        'Yes. A missing session rejects the call as `Unauthenticated`; an unavailable Auth Worker rejects it as `Authz.VerificationUnavailable`, so callers never mistake an outage for bad credentials.',
      proof: Story.trace(
        Effect.gen(function* () {
          const missingSession = yield* Effect.flip(
            runRpc(
              SettingsApi,
              SettingsHandlers,
              (client) => client.GetSettings({}),
              authLayer(() => Effect.succeed(null)),
            ),
          );
          const unavailableWorker = yield* Effect.flip(
            runRpc(
              SettingsApi,
              SettingsHandlers,
              (client) => client.GetSettings({}),
              authLayer(() => Effect.fail('Auth Worker unavailable')),
            ),
          );

          yield* Story.assert(
            'a missing session is Authz.Unauthenticated',
            missingSession instanceof Authz.Unauthenticated,
          );
          yield* Story.assert(
            'a broken verifier is Authz.VerificationUnavailable',
            unavailableWorker instanceof Authz.VerificationUnavailable,
          );
          return {
            missingSession: missingSession._tag,
            unavailableWorker: unavailableWorker._tag,
          };
        }),
      ),
    }),
    Story.question('Can a group remove an RPC policy?', {
      answer:
        'No. Adding authentication to the group does not weaken the administrator rule already attached to `DeleteWorkspace`.',
      proof: Story.trace(
        Effect.flip(
          runRpc(
            AdminApi,
            AdminHandlers,
            (client) => client.DeleteWorkspaceAtEdge({}),
            authLayer(() => Effect.succeed(resolvedAuth('member'))),
          ),
        ).pipe(
          Effect.tap((error) =>
            Story.assert(
              'the administrator policy still rejects a member',
              error instanceof Authz.Forbidden,
            ),
          ),
        ),
      ),
    }),
    Story.question('Is a failed batch verified repeatedly?', {
      answer:
        'No. Every call in the wrapped HTTP request receives the same verification failure.',
      proof: Story.trace(
        Effect.gen(function* () {
          const verificationCount = yield* Ref.make(0);
          const TestAuth = authLayer(() =>
            Ref.updateAndGet(verificationCount, (count) => count + 1).pipe(
              Effect.andThen(Effect.fail('Auth Worker unavailable')),
            ),
          );

          const response = yield* runHttpApp(WrappedRpcApp, TestAuth);
          const verifications = yield* Ref.get(verificationCount);

          yield* Story.assert(
            'the failed batch verifies once',
            verifications === 1,
          );
          return { verifications, status: response.status };
        }),
      ),
    }),
    Story.question('When are refreshed cookies relayed?', {
      answer:
        'Only when the request/response app uses `authzCookies`, and one cookie per name. Streaming and WebSocket transports cannot add headers after RPC execution.',
      proof: Story.trace(
        Effect.gen(function* () {
          const TestAuth = authLayer(() =>
            Effect.succeed(
              resolvedAuth('user-1', [
                'session=NEW; Path=/; HttpOnly',
                'session_cache=NEW; Path=/; HttpOnly',
              ]),
            ),
          );

          const wrapped = yield* runHttpApp(WrappedRpcApp, TestAuth);
          const unwrapped = yield* runHttpApp(UnwrappedRpcApp, TestAuth);
          const cookies = wrapped.headers.getSetCookie();

          yield* Story.assert(
            'the wrapper relays every distinctly named cookie',
            cookies.length === 2,
          );
          yield* Story.assert(
            'the unwrapped app relays none',
            unwrapped.headers.getSetCookie().length === 0,
          );
          return { cookies };
        }),
      ),
    }),
  ],
});
