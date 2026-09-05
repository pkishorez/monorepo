import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import { Authz } from 'auth-toolkit/rpc';
import { authLayer, resolvedAuth, runRpc } from '../support.js';

const administratorOnly = Authz.policy(
  ({ user }) => user.id === 'admin',
  'Administrator required',
);

const DeleteUser = Rpc.make('DeleteUser', {
  payload: { userId: Schema.String },
  success: Schema.String,
}).pipe(Authz.guard(administratorOnly));

const Api = RpcGroup.make(DeleteUser);
const Handlers = Api.toLayer({
  DeleteUser: ({ userId }) => Effect.succeed(`Deleted ${userId}`),
});

export const addingAPermissionRule = Story.make({
  title: 'Adding a permission rule',
  description:
    'Run an Effect authorization policy after authentication and before the handler.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('When does the authorization policy run?', {
      answer:
        'After Current Auth is resolved and before the handler. Define the rule once with `Authz.policy` and attach it with `Authz.guard`; it succeeds to allow the call or fails with `Forbidden` to deny it.',
      proof: Story.trace(
        runRpc(
          Api,
          Handlers,
          (client) => client.DeleteUser({ userId: 'former-employee' }),
          authLayer(() => Effect.succeed(resolvedAuth('admin'))),
        ).pipe(
          Effect.tap((result) =>
            Story.assert(
              'an administrator reaches the handler',
              result === 'Deleted former-employee',
            ),
          ),
        ),
      ),
    }),
    Story.question('Can a denied request reach the handler?', {
      answer:
        'No. `Forbidden` crosses the RPC boundary and the handler is skipped.',
      proof: Story.trace(
        Effect.flip(
          runRpc(
            Api,
            Handlers,
            (client) => client.DeleteUser({ userId: 'former-employee' }),
            authLayer(() => Effect.succeed(resolvedAuth('member'))),
          ),
        ).pipe(
          Effect.tap((error) =>
            Story.assert(
              'the caller receives Authz.Forbidden',
              error instanceof Authz.Forbidden,
            ),
          ),
        ),
      ),
    }),
  ],
});
