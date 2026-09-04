import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import {
  CurrentAuth,
  Unauthenticated,
  withAuthz,
} from 'auth-toolkit/server/rpc';
import { authLayer, runRpc } from '../support.js';

const GetProfile = Rpc.make('GetProfile', {
  payload: {},
  success: Schema.Struct({ userId: Schema.String }),
}).pipe(withAuthz());

const Api = RpcGroup.make(GetProfile);
const Handlers = Api.toLayer({
  GetProfile: () =>
    Effect.map(CurrentAuth, ({ user }) => ({ userId: user.id })),
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
        'Add `withAuthz()` to the RPC. The middleware verifies the session first, then makes its User and Session available as `CurrentAuth` while the handler runs.',
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
              error instanceof Unauthenticated,
            ),
          ),
        ),
      ),
    }),
  ],
});
