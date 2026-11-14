import * as Effect from 'effect/Effect';
import type * as Scope from 'effect/Scope';

/** Adds `listener` for the life of the current scope. */
export const listen = (
  target: EventTarget,
  type: string,
  listener: (event: Event) => void,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => target.addEventListener(type, listener)),
    () => Effect.sync(() => target.removeEventListener(type, listener)),
  );

/** False during SSR and in workers. */
export const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined';
