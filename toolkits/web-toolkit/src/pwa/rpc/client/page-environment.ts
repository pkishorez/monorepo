import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { WorkerError, WorkerSpawnError } from 'effect/workers/WorkerError';
import { BUILD_ID_META_NAME, BuildId } from '../../shared/build/index.js';

const spawnError = (message: string) =>
  new WorkerError({ reason: new WorkerSpawnError({ message }) });

const decodeBuildId = Schema.decodeUnknownOption(BuildId);

/** The page's Build ID, from the meta tag `pwaHead()` renders. */
export const pageBuildId: Effect.Effect<BuildId, WorkerError> = Effect.suspend(
  () => {
    const content = globalThis.document
      ?.querySelector<HTMLMetaElement>(`meta[name="${BUILD_ID_META_NAME}"]`)
      ?.getAttribute('content');
    return Option.match(decodeBuildId(content), {
      onSome: Effect.succeed,
      onNone: () =>
        Effect.fail(
          spawnError(
            `Worker RPC needs the Build ID meta tag (${BUILD_ID_META_NAME}); render pwaHead() in the document head`,
          ),
        ),
    });
  },
);

/** `navigator.serviceWorker`, where the browser offers it. */
export const serviceWorkerContainer: Effect.Effect<
  ServiceWorkerContainer,
  WorkerError
> = Effect.suspend(() => {
  const container = globalThis.navigator?.serviceWorker;
  return container === undefined
    ? Effect.fail(
        spawnError(
          'Worker RPC needs service workers (a secure context in a supporting browser)',
        ),
      )
    : Effect.succeed(container);
});

/**
 * Fails at once when no service worker will ever control this page, instead
 * of letting calls wait for a controller forever:
 * - the PWA is off in this build (the Kill Switch, or `vite dev` without
 *   `dev: true`), so nothing registers;
 * - an active worker exists but does not control the page after `graceMs`
 *   (a hard reload bypasses it until the next normal load).
 * On a first visit (nothing active yet) calls wait for the worker to take over.
 */
export const controllerComing = (options: {
  readonly enabled: boolean;
  readonly container: ServiceWorkerContainer;
  readonly graceMs: number;
}): Effect.Effect<void, WorkerError> =>
  Effect.gen(function* () {
    const { enabled, container, graceMs } = options;
    if (!enabled) {
      return yield* Effect.fail(
        spawnError(
          'Worker RPC has no service worker: the PWA is off in this build (the Kill Switch, or vite dev without dev: true)',
        ),
      );
    }
    if (container.controller !== null) return;
    const registration = yield* Effect.tryPromise(() =>
      container.getRegistration(),
    ).pipe(Effect.orElseSucceed(() => undefined));
    const active = registration?.active ?? null;
    if (active === null || registration?.installing !== null) return;
    const controlled = yield* Effect.callback<boolean>((resume) => {
      const onChange = () => resume(Effect.succeed(true));
      container.addEventListener('controllerchange', onChange);
      return Effect.sync(() =>
        container.removeEventListener('controllerchange', onChange),
      );
    }).pipe(Effect.timeoutOption(graceMs), Effect.map(Option.isSome));
    if (!controlled && container.controller === null) {
      return yield* Effect.fail(
        spawnError(
          'No service worker controls this page (a hard reload bypasses it); reload the page normally',
        ),
      );
    }
  });
