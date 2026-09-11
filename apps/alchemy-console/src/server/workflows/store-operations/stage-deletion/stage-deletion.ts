import { Effect, Stream } from 'effect';
import { StageDeletionLock } from '../../../storage/stage-deletion-lock/index.ts';
import { DeleteStageError } from '../../../../shared/contracts/delete-stage/index.ts';
import * as destruction from '../../../services/stage-destruction/stage-destruction/index.ts';

export const destroy = (target: Parameters<typeof destruction.destroy>[0]) =>
  Stream.unwrap(
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
      return destruction.destroy(target);
    }),
  );
