import { StageDeletionLock } from '../../storage/stage-deletion-lock/index.ts';
import { Effect, Stream } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import {
  canDeleteStage,
  DeleteStageError,
} from '../../../shared/contracts/delete-stage/index.ts';
import { alchemyStateStoreEntity as stores } from '../../storage/state-store-database/index.ts';
import * as destruction from '../../services/stage-destruction/index.ts';

type Target = { storeId: string; stack: string; stage: string };
const authorize = (input: Target) =>
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
            'This connection has view access. Update its token and choose Admin to delete stages.',
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

export const preview = (input: Target) =>
  authorize(input).pipe(
    Effect.flatMap(destruction.preview),
    Effect.withSpan('DeleteStage.preview'),
  );
export const destroy = (input: Target & { fingerprint: string }) =>
  Stream.unwrap(
    authorize(input).pipe(
      Effect.flatMap((target) =>
        Effect.gen(function* () {
          const lock = yield* StageDeletionLock;
          const key = JSON.stringify([
            new URL(target.connection.url).href,
            target.stack,
            target.stage,
          ]);
          const owner = crypto.randomUUID();
          yield* Effect.acquireRelease(
            lock.acquire(key, owner).pipe(
              Effect.mapError(
                () =>
                  new DeleteStageError({
                    code: 'storage-error',
                    reason: 'Could not lock this stage for deletion.',
                  }),
              ),
              Effect.flatMap((acquired) =>
                acquired
                  ? Effect.void
                  : Effect.fail(
                      new DeleteStageError({
                        code: 'remote-error',
                        reason:
                          'Another deletion is running for this stage. Wait for it to finish before retrying.',
                      }),
                    ),
              ),
            ),
            () => lock.release(key, owner).pipe(Effect.ignore),
          );
          return destruction.destroy({
            ...target,
            fingerprint: input.fingerprint,
          });
        }),
      ),
    ),
  );
