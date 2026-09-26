import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schedule from 'effect/Schedule';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import type { UpdateConfig } from '../domain/config/index.js';
import { sendControlRequest } from './control-channel.js';
import { listen } from './dom-events.js';
import { UpdateState } from './states.js';

const unsupported = Effect.map(
  SubscriptionRef.make<UpdateState>(UpdateState.Unsupported()),
  (state) => ({
    state,
    check: Effect.void,
    apply: Effect.void,
    navigated: Effect.void,
  }),
);

/**
 * Update Prompt state for one registration. Checks on load, on focus and
 * visibility, and every `checkIntervalMinutes`. Reloads only on
 * `controllerchange` after an accepted update (Coordinated Reload).
 */
export const makeUpdate = (
  config: UpdateConfig,
  registration: Option.Option<ServiceWorkerRegistration>,
) =>
  Option.match(registration, {
    onNone: () => unsupported,
    onSome: (registration) => makeRegisteredUpdate(config, registration),
  });

const makeRegisteredUpdate = Effect.fnUntraced(function* (
  config: UpdateConfig,
  registration: ServiceWorkerRegistration,
) {
  const container = navigator.serviceWorker;
  // A waiting worker is an update only when a previous version controls the tab.
  const hasUpdate = () =>
    registration.waiting !== null && container.controller !== null;

  const state = yield* SubscriptionRef.make<UpdateState>(
    hasUpdate() ? UpdateState.Available() : UpdateState.Idle(),
  );

  const markAvailable = SubscriptionRef.update(state, (current) =>
    current._tag === 'Applying' ? current : UpdateState.Available(),
  );
  const watchInstalling = (worker: ServiceWorker | null) =>
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && hasUpdate()) {
        Effect.runSync(markAvailable);
      }
    });

  const check = Effect.gen(function* () {
    const run = yield* SubscriptionRef.modify(state, (current) =>
      current._tag === 'Idle'
        ? [true, UpdateState.Checking()]
        : [current._tag === 'Available', current],
    );
    if (!run) return;
    yield* Effect.tryPromise(() => registration.update()).pipe(Effect.ignore);
    yield* SubscriptionRef.update(state, (current) =>
      current._tag !== 'Checking'
        ? current
        : hasUpdate()
          ? UpdateState.Available()
          : UpdateState.Idle(),
    );
  });

  const apply = Effect.gen(function* () {
    const waiting = registration.waiting;
    const accepted = yield* SubscriptionRef.modify(state, (current) =>
      current._tag === 'Available' && waiting !== null
        ? [true, UpdateState.Applying()]
        : [false, current],
    );
    if (!accepted || waiting === null) return;
    const reply = yield* sendControlRequest(waiting, 'SKIP_WAITING');
    if (Option.isNone(reply) || reply.value.type === 'FAILED') {
      yield* Effect.logWarning(
        'pwa-toolkit: waiting worker did not activate',
        reply,
      );
      yield* SubscriptionRef.set(state, UpdateState.Available());
    }
  });

  // First install claims the tab with no previous controller: not an update, no reload.
  let hadController = container.controller !== null;
  let reloading = false;
  yield* listen(container, 'controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  watchInstalling(registration.installing);
  yield* listen(registration, 'updatefound', () =>
    watchInstalling(registration.installing),
  );

  const runCheck = () => void Effect.runFork(check);
  yield* listen(window, 'focus', runCheck);
  yield* listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') runCheck();
  });
  yield* Effect.forkScoped(
    check.pipe(
      Effect.repeat(
        Schedule.spaced(Duration.minutes(config.checkIntervalMinutes)),
      ),
    ),
  );

  return {
    state,
    check,
    apply,
    navigated: config.mode === 'auto-on-navigation' ? apply : Effect.void,
  };
});
