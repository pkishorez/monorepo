import { Cause, Effect, Exit } from 'effect';

export async function executeQuery<A, E>(
  effect: Effect.Effect<A, E>,
  signal: AbortSignal,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect, { signal });
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  return exit.value;
}
