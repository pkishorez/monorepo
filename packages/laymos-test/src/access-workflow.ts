import { Effect, Match } from 'effect';

export interface AccessInput {
  readonly actorId: string;
  readonly policy: 'allow' | 'challenge' | 'deny';
}

export type AccessResult = 'granted' | 'verification-required' | 'blocked';

const loadPolicy = (_actorId: string) => Effect.sleep(1);

const writeAuditEntry = () => Effect.sleep(1);

export const authorizeAccess = (
  input: AccessInput,
): Effect.Effect<AccessResult> =>
  Effect.gen(function* () {
    yield* Effect.all([loadPolicy(input.actorId), writeAuditEntry()], {
      concurrency: 'unbounded',
    });

    return yield* Match.value(input.policy).pipe(
      Match.when('allow', () => Effect.succeed('granted' as const)),
      Match.when('challenge', () =>
        Effect.succeed('verification-required' as const),
      ),
      Match.when('deny', () => Effect.succeed('blocked' as const)),
      Match.exhaustive,
    );
  });
