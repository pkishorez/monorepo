import * as Data from 'effect/Data';
import * as Deferred from 'effect/Deferred';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schedule from 'effect/Schedule';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { listen } from '../../contract/dom-events.js';
import type { UpdateConfig } from '../../contract/config/index.js';
import { sendCommand } from '../commands/index.js';

/**
 * The page's one view of its service worker.
 * - `Unsupported`: no service workers here, or the PWA is off in this build.
 * - `Installing`: first visit; the worker is saving this build's files.
 * - `Ready`: the worker is active; the app works offline.
 * - `UpdateReady`: a newer build is downloaded and waiting.
 * - `Updating`: the update was accepted; every page is about to reload.
 */
export type PwaStatus = Data.TaggedEnum<{
  Unsupported: {};
  Installing: {};
  Ready: {};
  UpdateReady: {};
  Updating: {};
}>;
export const PwaStatus = Data.taggedEnum<PwaStatus>();

export interface StatusService {
  readonly status: SubscriptionRef.SubscriptionRef<PwaStatus>;
  /**
   * Asks the server for a newer build and, if one starts installing, waits
   * until it is downloaded (at most `INSTALL_WAIT`). Succeeds with whether
   * a newer build is now downloaded and waiting. One check runs at a time:
   * a caller that asks during one waits for it.
   */
  readonly checkForUpdate: Effect.Effect<boolean>;
  readonly applyUpdate: Effect.Effect<void>;
  /**
   * Reloads the page into the newest build: applies the one downloaded,
   * else checks every `RETRY_EVERY` until one is, then applies it, and
   * every open page reloads into it. With no worker controlling the page,
   * it reloads the page itself, which loads the newest build.
   */
  readonly reloadToNewest: Effect.Effect<void>;
}

/** How long a check waits for a newer build that started installing. */
export const INSTALL_WAIT = Duration.seconds(60);

/** How often `reloadToNewest` checks while no newer build is downloaded. */
export const RETRY_EVERY = Duration.seconds(12);

const reloadPage = Effect.sync(() => window.location.reload());

const unsupported = Effect.map(
  SubscriptionRef.make<PwaStatus>(PwaStatus.Unsupported()),
  (status): StatusService => ({
    status,
    checkForUpdate: Effect.succeed(false),
    applyUpdate: Effect.void,
    reloadToNewest: reloadPage,
  }),
);

/**
 * Status for one registration, from the browser's own service worker events;
 * the worker is never asked. Checks for an update on load, on focus and
 * visibility, and every `checkIntervalMinutes`. Reloads only on
 * `controllerchange` after an update activates, in every open page.
 */
export const makeStatus = (
  config: UpdateConfig,
  registration: Option.Option<ServiceWorkerRegistration>,
) =>
  Option.match(registration, {
    onNone: () => unsupported,
    onSome: (registration) => makeRegisteredStatus(config, registration),
  });

const makeRegisteredStatus = Effect.fnUntraced(function* (
  config: UpdateConfig,
  registration: ServiceWorkerRegistration,
) {
  const container = navigator.serviceWorker;
  // A waiting worker is an update only when a previous version controls the page.
  const hasUpdate = () =>
    registration.waiting !== null && container.controller !== null;
  const initial = (): PwaStatus =>
    hasUpdate()
      ? PwaStatus.UpdateReady()
      : registration.active === null
        ? PwaStatus.Installing()
        : PwaStatus.Ready();

  const status = yield* SubscriptionRef.make<PwaStatus>(initial());
  const set = (next: PwaStatus) =>
    Effect.runSync(
      SubscriptionRef.update(status, (current) =>
        current._tag === 'Updating' ? current : next,
      ),
    );

  const watchInstalling = (worker: ServiceWorker | null) =>
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && hasUpdate()) {
        set(PwaStatus.UpdateReady());
      } else if (worker.state === 'redundant' && registration.active === null) {
        // The first install failed (e.g. a Precache download); the next load retries.
        set(PwaStatus.Unsupported());
      }
    });

  // `update()` resolves once a newer worker starts installing, before it
  // has downloaded the build; it is done once installed, or redundant.
  const installed = (worker: ServiceWorker) =>
    Effect.callback<void>((resume) => {
      const settled = () => {
        if (worker.state !== 'parsed' && worker.state !== 'installing') {
          worker.removeEventListener('statechange', settled);
          resume(Effect.void);
        }
      };
      worker.addEventListener('statechange', settled);
      settled();
      return Effect.sync(() =>
        worker.removeEventListener('statechange', settled),
      );
    });

  const check = Effect.gen(function* () {
    yield* Effect.tryPromise(() => registration.update()).pipe(Effect.ignore);
    const installing = registration.installing;
    if (installing !== null) {
      yield* installed(installing).pipe(Effect.timeoutOption(INSTALL_WAIT));
    }
    if (hasUpdate()) set(PwaStatus.UpdateReady());
    return hasUpdate();
  });

  // The check runs in the status's own scope, so a caller that stops
  // waiting never cuts it short for the others.
  const scope = yield* Effect.scope;
  let running: Deferred.Deferred<boolean> | null = null;
  const checkForUpdate = Effect.suspend((): Effect.Effect<boolean> => {
    if (running !== null) return Deferred.await(running);
    if (SubscriptionRef.getUnsafe(status)._tag !== 'Ready') {
      return Effect.sync(hasUpdate);
    }
    const done = Deferred.makeUnsafe<boolean>();
    running = done;
    return check.pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => (running = null)).pipe(
          Effect.andThen(Deferred.done(done, exit)),
        ),
      ),
      Effect.forkIn(scope),
      Effect.andThen(Deferred.await(done)),
    );
  });

  const applyUpdate = Effect.gen(function* () {
    const waiting = registration.waiting;
    const accepted = yield* SubscriptionRef.modify(status, (current) =>
      current._tag === 'UpdateReady' && waiting !== null
        ? [true, PwaStatus.Updating()]
        : [false, current],
    );
    if (!accepted || waiting === null) return;
    const reply = yield* sendCommand(waiting, 'SKIP_WAITING');
    if (Option.isNone(reply) || reply.value.type === 'FAILED') {
      yield* Effect.logWarning(
        'pwa-toolkit: waiting worker did not activate',
        reply,
      );
      yield* SubscriptionRef.set(status, PwaStatus.UpdateReady());
    }
  });

  const reloadToNewest = Effect.gen(function* () {
    // No worker to move through: first install, a failed one, or a hard reload.
    if (
      container.controller === null ||
      SubscriptionRef.getUnsafe(status)._tag === 'Unsupported'
    ) {
      return yield* reloadPage;
    }
    while (true) {
      if (yield* checkForUpdate) yield* applyUpdate;
      // Accepted: `controllerchange` reloads every page.
      if ((yield* SubscriptionRef.get(status))._tag === 'Updating') return;
      yield* Effect.sleep(RETRY_EVERY);
    }
  });

  // First install takes control of a page with no previous controller: Ready, no reload.
  let hadController = container.controller !== null;
  let reloading = false;
  yield* listen(container, 'controllerchange', () => {
    if (!hadController) {
      hadController = true;
      set(PwaStatus.Ready());
      return;
    }
    if (reloading) return;
    reloading = true;
    Effect.runSync(SubscriptionRef.set(status, PwaStatus.Updating()));
    window.location.reload();
  });

  watchInstalling(registration.installing);
  yield* listen(registration, 'updatefound', () =>
    watchInstalling(registration.installing),
  );

  const runCheck = () => void Effect.runFork(checkForUpdate);
  yield* listen(window, 'focus', runCheck);
  yield* listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') runCheck();
  });
  yield* Effect.forkScoped(
    checkForUpdate.pipe(
      Effect.repeat(
        Schedule.spaced(Duration.minutes(config.checkIntervalMinutes)),
      ),
    ),
  );

  return {
    status,
    checkForUpdate,
    applyUpdate,
    reloadToNewest,
  } satisfies StatusService;
});
