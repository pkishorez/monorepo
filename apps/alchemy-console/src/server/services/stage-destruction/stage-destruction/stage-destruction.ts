import { Effect, Queue, Schedule, Schema, Stream } from 'effect';
import {
  deletionPlan,
  deletionEvent,
  previewEvent,
  DeleteStageError,
} from '../../../../shared/contracts/delete-stage/index.ts';
import { execute } from 'alchemy-console/stage-destruction-engine';
import { destructionRequest } from './request.ts';

type Target = typeof destructionRequest.Type;
const failure = (reason: string) =>
  new DeleteStageError({ code: 'remote-error', reason });
const validate = Schema.decodeUnknownEffect(destructionRequest);

const heartbeat = <A, E>(queue: Queue.Queue<A, E>, event: A) =>
  Effect.forkScoped(
    Effect.sync(() => {
      Queue.offerUnsafe(queue, event);
    }).pipe(Effect.repeat(Schedule.spaced('10 seconds'))),
  );

type Outcome = Extract<typeof previewEvent.Type, { kind: 'plan' | 'failed' }>;

export const preview = (target: Target) =>
  Stream.callback<typeof previewEvent.Type, DeleteStageError>((queue) =>
    Effect.gen(function* () {
      const input = yield* validate(target).pipe(
        Effect.mapError(() =>
          failure(
            'Invalid deletion target. Refresh the stage before retrying.',
          ),
        ),
      );
      yield* heartbeat(queue, { kind: 'heartbeat' });
      const outcome = yield* Effect.gen(function* () {
        const result = yield* execute(input, 'preview', (event) => {
          if (event.kind === 'analyzing' || event.kind === 'analyzed')
            Queue.offerUnsafe(queue, event);
        }).pipe(Effect.timeout('2 minutes'));
        if (result && 'error' in result)
          return {
            kind: 'failed',
            id: result.resource,
            message: result.error,
          } satisfies Outcome;
        const plan = yield* Schema.decodeUnknownEffect(deletionPlan)(result);
        return { kind: 'plan', plan } satisfies Outcome;
      }).pipe(
        Effect.catchCause(() =>
          Effect.succeed({
            kind: 'failed',
            id: null,
            message:
              'Could not prepare the deletion plan. No resources were deleted.',
          } satisfies Outcome),
        ),
      );
      Queue.offerUnsafe(queue, outcome);
      Queue.endUnsafe(queue);
    }),
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
      yield* heartbeat(queue, {
        kind: 'heartbeat',
        id: null,
        status: 'running',
        message: '',
      });
      yield* execute(input, 'delete', (event) => {
        if ('status' in event) Queue.offerUnsafe(queue, event);
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
