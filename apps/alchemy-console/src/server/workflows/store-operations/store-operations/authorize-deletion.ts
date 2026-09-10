import { Effect } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import {
  canDeleteStage,
  DeleteStageError,
} from '../../../../shared/contracts/delete-stage/index.ts';
import { alchemyStateStoreEntity as stores } from '../../../storage/state-store-database/index.ts';

type Target = { storeId: string; stack: string; stage: string };
export const authorizeDeletion = (input: Target) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    if (!canDeleteStage(input.stage))
      return yield* Effect.fail(
        new DeleteStageError({
          code: 'protected-stage',
          reason: 'Stages whose names start with prod are protected.',
        }),
      );
    const store = yield* stores
      .get({ userId: user.id, id: input.storeId }, { excludeDeleted: true })
      .pipe(
        Effect.mapError(
          () =>
            new DeleteStageError({
              code: 'storage-error',
              reason: 'Could not load the saved connection.',
            }),
        ),
      );
    if (!store)
      return yield* Effect.fail(
        new DeleteStageError({
          code: 'not-found',
          reason: 'This store is no longer available.',
        }),
      );
    const { connection, access } = store.value;
    if (access !== 'admin' || !connection.apiToken || !connection.accountId)
      return yield* Effect.fail(
        new DeleteStageError({
          code: 'view-only',
          reason:
            'This connection has view access. Update its token with one that has admin permissions to delete stages.',
        }),
      );
    return {
      stack: input.stack,
      stage: input.stage,
      connection: {
        ...connection,
        accountId: connection.accountId,
        apiToken: connection.apiToken,
      },
    };
  });
