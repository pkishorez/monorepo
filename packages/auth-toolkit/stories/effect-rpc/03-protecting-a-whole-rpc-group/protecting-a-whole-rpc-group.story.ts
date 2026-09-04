import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import { Forbidden, withAuthz } from 'auth-toolkit/server/rpc';
import { authLayer, resolvedAuth, runRpc } from '../support.js';

const GetWorkspace = Rpc.make('GetWorkspace', {
  payload: {},
  success: Schema.String,
});

const DeleteWorkspace = Rpc.make('DeleteWorkspace', {
  payload: {},
  success: Schema.String,
}).pipe(
  withAuthz(({ user }) =>
    user.id === 'admin'
      ? Effect.void
      : Effect.fail(new Forbidden({ reason: 'Administrator required' })),
  ),
);

const WorkspaceApi = withAuthz(({ user }) =>
  user.id === 'owner'
    ? Effect.void
    : Effect.fail(new Forbidden({ reason: 'Workspace owner required' })),
)(RpcGroup.make(GetWorkspace, DeleteWorkspace));

const WorkspaceHandlers = WorkspaceApi.toLayer({
  GetWorkspace: () => Effect.succeed('Acme workspace'),
  DeleteWorkspace: () => Effect.succeed('Workspace deleted'),
});

const GetAuditLog = Rpc.make('GetAuditLog', {
  payload: {},
  success: Schema.String,
});

const SupportApi = withAuthz(({ user }) =>
  user.id === 'support'
    ? Effect.void
    : Effect.fail(new Forbidden({ reason: 'Support access required' })),
)(RpcGroup.make(GetAuditLog));

const GetDashboard = Rpc.make('GetDashboard', {
  payload: {},
  success: Schema.String,
});

const PortalApi = withAuthz(({ user }) =>
  user.id === 'member'
    ? Effect.void
    : Effect.fail(new Forbidden({ reason: 'Membership required' })),
)(RpcGroup.make(GetDashboard).merge(SupportApi));

const PortalHandlers = PortalApi.toLayer({
  GetAuditLog: () => Effect.succeed('Audit log'),
  GetDashboard: () => Effect.succeed('Dashboard'),
});

export const protectingAWholeRpcGroup = Story.make({
  title: 'Protecting a whole RPC group',
  description:
    'Set a default policy for a group while keeping stricter rules close to individual RPCs.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Does an RPC policy override its group policy?', {
      answer:
        'Yes. `GetWorkspace` uses the owner rule from the group. `DeleteWorkspace` keeps its own administrator rule.',
      proof: Story.trace(
        Effect.gen(function* () {
          const workspace = yield* runRpc(
            WorkspaceApi,
            WorkspaceHandlers,
            (client) => client.GetWorkspace({}),
            authLayer(() => Effect.succeed(resolvedAuth('owner'))),
          );
          const deleted = yield* runRpc(
            WorkspaceApi,
            WorkspaceHandlers,
            (client) => client.DeleteWorkspace({}),
            authLayer(() => Effect.succeed(resolvedAuth('admin'))),
          );

          yield* Story.assert(
            'each call uses the policy nearest to its RPC',
            workspace === 'Acme workspace' && deleted === 'Workspace deleted',
          );
          return { workspace, deleted };
        }),
      ),
    }),
    Story.question('Does an outer group replace a nested group policy?', {
      answer:
        'No. The support API keeps its support rule after it is merged into the member portal.',
      proof: Story.trace(
        runRpc(
          PortalApi,
          PortalHandlers,
          (client) => client.GetAuditLog({}),
          authLayer(() => Effect.succeed(resolvedAuth('support'))),
        ).pipe(
          Effect.tap((auditLog) =>
            Story.assert(
              'support can read the nested audit log',
              auditLog === 'Audit log',
            ),
          ),
        ),
      ),
    }),
  ],
});
