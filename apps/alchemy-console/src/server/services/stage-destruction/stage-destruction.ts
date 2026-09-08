import { Effect, Queue, Schedule, Schema, Stream } from 'effect';
import {
  deletionPlan,
  deletionEvent,
  DeleteStageError,
} from '../../../shared/contracts/delete-stage/index.ts';
import { execute } from 'alchemy-console/stage-destruction-engine';
import { destructionRequest } from './request.ts';

type Target = typeof destructionRequest.Type;
const failure = (reason: string) =>
  new DeleteStageError({ code: 'remote-error', reason });
const validate = Schema.decodeUnknownEffect(destructionRequest);

export const preview = (target: Target) =>
  Effect.gen(function* () {
    const input = yield* validate(target);
    const result = yield* execute(input, 'preview', () => {});
    if (result && 'error' in result)
      return yield* Effect.fail(failure(result.error));
    return yield* Schema.decodeUnknownEffect(deletionPlan)(result);
  }).pipe(
    Effect.scoped,
    Effect.timeout('2 minutes'),
    Effect.catch((error) =>
      Effect.fail(
        error instanceof DeleteStageError
          ? error
          : failure(
              'Could not prepare the deletion plan. No resources were deleted.',
            ),
      ),
    ),
  );

export const destroy = (target: Target) =>
  Stream.callback<typeof deletionEvent.Type, DeleteStageError>((queue) =>
    Effect.gen(function* () {
      const input = yield* validate(target).pipe(
        Effect.mapError(() =>
          failure(
            'Invalid deletion target. Refresh the stage before retrying.',
          ),
        ),
      );
      yield* Effect.forkScoped(
        Effect.sync(() => {
          Queue.offerUnsafe(queue, {
            kind: 'heartbeat',
            id: null,
            status: 'running',
            message: '',
          });
        }).pipe(Effect.repeat(Schedule.spaced('10 seconds'))),
      );
      yield* execute(input, 'delete', (event) => {
        Queue.offerUnsafe(queue, event);
      }).pipe(
        Effect.timeout('15 minutes'),
        Effect.catchCause(() =>
          Effect.sync(() => {
            Queue.offerUnsafe(queue, {
              kind: 'failed',
              id: null,
              status: 'failed',
              message:
                'Deletion was interrupted. Refresh the stage and review its remaining resources before retrying.',
            });
          }),
        ),
      );
      Queue.endUnsafe(queue);
    }),
  );
