import { Cause, Effect, Exit } from 'effect';
import type { Context } from 'effect';

/**
 * Run an Effect as a fiber with the Services it was given, reporting any
 * failure other than being stopped.
 */
export const fork = <A>(
  path: string,
  services: Context.Context<never>,
  effect: Effect.Effect<A, never, any>,
) => {
  const fiber = Effect.runForkWith(services)(effect as Effect.Effect<A>);
  fiber.addObserver((exit) => {
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      console.error(
        `[effect-oak] ${path} failed:\n${Cause.pretty(exit.cause)}`,
      );
    }
  });
  return fiber;
};
