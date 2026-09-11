import { Effect, Stream } from 'effect';
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

export const destroy = (request: Request) => engine.destroy(request);
