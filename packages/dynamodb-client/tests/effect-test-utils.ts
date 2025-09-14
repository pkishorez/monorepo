import { Effect, Either } from "effect";

/**
 * Run an Effect program and return the result as Either for testing.
 * This preserves Effect composition and allows proper error type checking.
 */
export function runEffectTest <A, E>(effect: Effect.Effect<A, E>) {
  return Effect.runPromise(Effect.either(effect))
}

/**
 * Assert that an Effect succeeds with a specific result using Either.
 */
export function assertSuccess <A, E>(effect: Effect.Effect<A, E>,
  assertion: (result: A) => Effect.Effect<void>): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const result = yield* effect;
    yield* assertion(result);
    return result;
  })
}

/**
 * Assert that an Effect succeeds and run synchronous assertions.
 */
export function assertSuccessSync <A, E>(assertion: (result: A) => void) {
  return (effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
    assertSuccess(effect, (result) => Effect.sync(() => assertion(result)))
}

/**
 * Assert that an Effect fails with a specific error type using Either.
 */
export function assertFailure <A, E>(errorAssertion: (error: E) => Effect.Effect<void>): ((effect: Effect.Effect<A, E>) => Effect.Effect<void, never>) {
  return (effect) =>
    Effect.gen(function* () {
      const either = yield* Effect.either(effect);

      if (Either.isRight(either)) {
        yield* Effect.fail(
          new Error(`Expected effect to fail, but it succeeded with: ${JSON.stringify(either.right)}`),
        );
      }

      yield* errorAssertion(either.left);
    })
}

/**
 * Assert that an Effect fails and run synchronous error assertions.
 */
export function assertFailureSync <A, E>(errorAssertion: (error: E) => void): ((effect: Effect.Effect<A, E>) => Effect.Effect<void, never>) {
  return assertFailure((error) => Effect.sync(() => errorAssertion(error)))
}

/**
 * Test that an Effect either succeeds or fails, handling both cases.
 */
export function testEither <A, E>(effect: Effect.Effect<A, E>,
  onSuccess: (result: A) => Effect.Effect<void>,
  onFailure: (error: E) => Effect.Effect<void>): Effect.Effect<void> {
  return Effect.gen(function* () {
    const either = yield* Effect.either(effect);

    if (Either.isRight(either)) {
      yield* onSuccess(either.right);
    } else {
      yield* onFailure(either.left);
    }
  })
}

/**
 * Sleep for a specified number of milliseconds as an Effect.
 */
export function sleep (ms: number) {
  return Effect.async<void>((resume) => {
    const timeout = setTimeout(() => resume(Effect.void), ms);
    return Effect.sync(() => clearTimeout(timeout));
  })
}

/**
 * Retry an Effect until it succeeds or max attempts are reached.
 */
export function retryUntil <A, E>(effect: Effect.Effect<A, E>,
  predicate: (result: A) => boolean,
  maxAttempts: number = 10,
  delayMs: number = 1000): Effect.Effect<A, E | string> {
  return Effect.gen(function* () {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const either = yield* Effect.either(effect);

      if (Either.isRight(either) && predicate(either.right)) {
        return either.right;
      }

      if (attempt === maxAttempts) {
        if (Either.isLeft(either)) {
          return yield* Effect.fail(either.left);
        }
        return yield* Effect.fail(`Max attempts (${maxAttempts}) exceeded - predicate never satisfied`);
      }

      yield* sleep(delayMs);
    }

    return yield* Effect.fail(`Max attempts (${maxAttempts}) exceeded`);
  })
}

/**
 * Create a synchronous Effect that runs an expectation
 */
export function expectEffect <T>(assertion: () => T) {
  return Effect.sync(() => assertion())
}

/**
 * Check if an error is of a specific type (by _tag for tagged errors)
 */
export function isErrorOfType <E extends { readonly _tag: string }>(expectedTag: string) {
  return (error: E): error is E =>
    error && typeof error === "object" && "_tag" in error && error._tag === expectedTag
}