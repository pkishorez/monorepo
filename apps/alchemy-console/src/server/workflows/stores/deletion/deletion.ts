import { Effect, Stream } from 'effect';
import { DeletionLock } from '../../../storage/deletion-lock/index.ts';
import {
  acknowledgesProtectedStage,
  DeletionError,
} from '../../../../shared/contracts/deletion/index.ts';
import { isAlchemyManagedStack } from '../../../../shared/contracts/targets/index.ts';
import * as engine from '../../../services/deletion/deletion/index.ts';

type Request = Parameters<typeof engine.preview>[0];
type Intent =
  | { kind: 'preview' }
  | { kind: 'delete'; acknowledgement: string | undefined };

/** Policy that applies before any credential is read: managed stacks and protected stages. */
export const authorize = (
  target: { stack: string; stage: string },
  intent: Intent,
) =>
  Effect.gen(function* () {
    if (isAlchemyManagedStack(target.stack))
      return yield* Effect.fail(
        new DeletionError({
          code: 'managed-stack',
          reason:
            'Alchemy-managed state infrastructure cannot use generic stage deletion. Use Alchemy’s dedicated state-store teardown flow.',
        }),
      );
    if (
      intent.kind === 'delete' &&
      !acknowledgesProtectedStage(target.stage, intent.acknowledgement)
    )
      return yield* Effect.fail(
        new DeletionError({
          code: 'protected-stage',
          reason:
            'Stages whose names start with prod need the acknowledgement phrase before deletion.',
        }),
      );
  });

export const preview = (request: Request) =>
  engine.preview(request).pipe(Stream.withSpan('Deletion.preview'));

export const destroy = (request: Request) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const lock = yield* DeletionLock;
      const key = JSON.stringify([
        new URL(request.state.url).href,
        request.stack,
        request.stage,
      ]);
      const owner = crypto.randomUUID();
      yield* Effect.acquireRelease(
        lock.acquire(key, owner).pipe(
          Effect.mapError(
            () =>
              new DeletionError({
                code: 'storage-error',
                reason: 'Could not lock this stage for deletion.',
              }),
          ),
          Effect.flatMap((acquired) =>
            acquired
              ? Effect.void
              : Effect.fail(
                  new DeletionError({
                    code: 'remote-error',
                    reason:
                      'Another deletion is running for this stage. Wait for it to finish before retrying.',
                  }),
                ),
          ),
        ),
        () => lock.release(key, owner).pipe(Effect.ignore),
      );
      return engine.destroy(request);
    }),
  );
