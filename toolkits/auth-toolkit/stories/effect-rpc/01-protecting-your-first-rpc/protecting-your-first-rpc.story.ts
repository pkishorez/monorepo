import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import { Authz } from 'auth-toolkit/rpc';
import { authLayer, runRpc } from '../support.js';

const GetProfile = Rpc.make('GetProfile', {
  payload: {},
  success: Schema.Struct({ userId: Schema.String }),
}).pipe(Authz.guard());

const Api = RpcGroup.make(GetProfile);
const Handlers = Api.toLayer({
  GetProfile: () =>
    Effect.map(Authz.CurrentAuth, ({ user }) => ({ userId: user.id })),
});

export const protectingYourFirstRpc = Story.make({
  title: 'Protecting your first RPC',
  description:
    'Require a valid session and read its Current Auth inside the handler.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does a handler read the authenticated user?', {
      answer:
        'Attach `Authz.guard()` to the RPC. Its Server Implementation verifies the session first, then makes the User and Session available as `CurrentAuth` while the handler runs.',
      proof: Story.trace(
        runRpc(Api, Handlers, (client) =>
          client.GetProfile({}, { headers: { cookie: 'session=valid' } }),
        ).pipe(
          Effect.tap(({ userId }) =>
            Story.assert('the handler receives Current Auth', userId === 'u1'),
          ),
        ),
      ),
    }),
    Story.question('What happens when there is no valid session?', {
      answer: 'The call fails with `Unauthenticated` before the handler runs.',
      proof: Story.trace(
        Effect.flip(
          runRpc(
            Api,
            Handlers,
            (client) => client.GetProfile({}),
            authLayer(() => Effect.succeed(null)),
          ),
        ).pipe(
          Effect.tap((error) =>
            Story.assert(
              'the request is rejected as unauthenticated',
              error instanceof Authz.Unauthenticated,
            ),
          ),
        ),
      ),
    }),
  ],
});
