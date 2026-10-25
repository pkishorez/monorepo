import { Effect, Effectable } from 'effect';

import type { Forbidden } from './errors.js';
import { User, type Policy } from './guard.js';

/** `guard`, which carries `policy`, made also the same check as an Effect,
 * the way a Context.Service is a class that is also an Effect: the
 * function's prototype is an Effect's. */
export const withEffect = <G extends object>(
  guard: G,
  policy: Policy,
): G & Effect.Effect<void, Forbidden, User> =>
  Object.setPrototypeOf(
    guard,
    Effectable.Prototype<Effect.Effect<void, Forbidden, User>>({
      label: 'auth-toolkit/policy',
      evaluate: () => Effect.flatMap(User, policy),
    }),
  );
