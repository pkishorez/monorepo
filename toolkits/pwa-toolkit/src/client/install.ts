import * as Effect from 'effect/Effect';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { readDisplayMode } from './display-mode.js';
import { isBrowser, listen } from './dom-events.js';
import { dismissedRecently, rememberDismissal } from './install-dismissal.js';
import { isIosSafari } from './ios.js';
import { InstallState } from './states.js';

/** Chromium's install event; not in the DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

const initialState = (): InstallState => {
  if (!isBrowser()) return InstallState.Unsupported();
  if (readDisplayMode() !== 'browser') return InstallState.Installed();
  if (dismissedRecently()) return InstallState.Dismissed();
  if (isIosSafari(navigator)) return InstallState.ManualIos();
  return InstallState.Unsupported();
};

/**
 * Install Prompt state. Captures `beforeinstallprompt` so the app decides
 * when to ask. `prompt` still works after a dismissal; dismissal only hides
 * the unsolicited Install Prompt.
 */
export const makeInstall = Effect.gen(function* () {
  const state = yield* SubscriptionRef.make(initialState());
  let deferred: BeforeInstallPromptEvent | null = null;

  const dismiss = Effect.sync(rememberDismissal).pipe(
    Effect.andThen(
      SubscriptionRef.update(state, (current) =>
        current._tag === 'Installed' ? current : InstallState.Dismissed(),
      ),
    ),
  );

  if (isBrowser()) {
    yield* listen(window, 'beforeinstallprompt', (event) => {
      event.preventDefault();
      deferred = event as BeforeInstallPromptEvent;
      Effect.runSync(
        SubscriptionRef.update(state, (current) =>
          current._tag === 'Unsupported' ? InstallState.Available() : current,
        ),
      );
    });
    yield* listen(window, 'appinstalled', () => {
      deferred = null;
      Effect.runSync(SubscriptionRef.set(state, InstallState.Installed()));
    });
  }

  const prompt = Effect.suspend(() => {
    const event = deferred;
    if (event === null) return Effect.succeed('unavailable' as const);
    // The browser lets each event prompt once.
    deferred = null;
    return Effect.tryPromise(async () => {
      await event.prompt();
      return (await event.userChoice).outcome;
    }).pipe(
      Effect.tap((outcome) =>
        outcome === 'accepted'
          ? SubscriptionRef.set(state, InstallState.Installed())
          : dismiss,
      ),
      Effect.orElseSucceed(() => 'unavailable' as const),
    );
  });

  return { state, prompt, dismiss };
});
