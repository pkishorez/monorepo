import * as Data from 'effect/Data';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schedule from 'effect/Schedule';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { listen } from '../../browser/dom-events.js';
import type { UpdateConfig } from '../../shared/config/index.js';
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
  readonly checkForUpdate: Effect.Effect<void>;
  readonly applyUpdate: Effect.Effect<void>;
}

const unsupported = Effect.map(
  SubscriptionRef.make<PwaStatus>(PwaStatus.Unsupported()),
  (status): StatusService => ({
    status,
    checkForUpdate: Effect.void,
    applyUpdate: Effect.void,
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

  let checking = false;
  const checkForUpdate = Effect.gen(function* () {
    const current = yield* SubscriptionRef.get(status);
    if (checking || current._tag !== 'Ready') return;
    checking = true;
    yield* Effect.tryPromise(() => registration.update()).pipe(
      Effect.ignore,
      Effect.ensuring(Effect.sync(() => (checking = false))),
    );
    if (hasUpdate()) set(PwaStatus.UpdateReady());
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

  return { status, checkForUpdate, applyUpdate } satisfies StatusService;
});
