import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { useMemo } from 'react';
import { isBrowser, listen } from '../../browser/dom-events.js';
import { useSubscriptionRef } from '../../browser/subscription-ref.js';
import { readDisplayMode } from '../display-mode/index.js';
import { lazyService } from '../lazy-service/index.js';
import { dismissedRecently, rememberDismissal } from './install-dismissal.js';
import { isIosSafari } from './ios.js';

export type InstallState = Data.TaggedEnum<{
  Unsupported: {};
  Available: {};
  ManualIos: {};
  Installed: {};
  Dismissed: {};
}>;
export const InstallState = Data.taggedEnum<InstallState>();

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
 * Install Prompt state: adding the app to the home screen or dock. Captures
 * `beforeinstallprompt` so the app decides when to ask. `prompt` still works
 * after a dismissal; dismissal (remembered for 30 days) only hides the
 * unsolicited Install Prompt.
 */
export class Install extends Context.Service<
  Install,
  {
    readonly state: SubscriptionRef.SubscriptionRef<InstallState>;
    readonly prompt: Effect.Effect<'accepted' | 'dismissed' | 'unavailable'>;
    readonly dismiss: Effect.Effect<void>;
  }
>()('@kstackz/web-toolkit/pwa/Install') {
  static readonly layer: Layer.Layer<Install> = Layer.effect(
    this,
    Effect.gen(function* () {
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
              current._tag === 'Unsupported'
                ? InstallState.Available()
                : current,
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
    }),
  );
}

const useInstallService = lazyService(Install, Install.layer);
const UNSUPPORTED = InstallState.Unsupported();

/**
 * Install state with `prompt` and `dismiss`; `Unsupported` during SSR and
 * until known. The browser offers install once, early, so call this (or
 * render `InstallPrompt`) in the root component: that starts listening.
 */
export const useInstall = (): {
  readonly state: InstallState;
  readonly prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  readonly dismiss: () => void;
} => {
  const install = useInstallService();
  const state = useSubscriptionRef(install?.state, UNSUPPORTED);
  return useMemo(
    () => ({
      state,
      prompt: () =>
        install === undefined
          ? Promise.resolve('unavailable' as const)
          : Effect.runPromise(install.prompt),
      dismiss: () => {
        if (install !== undefined) void Effect.runPromise(install.dismiss);
      },
    }),
    [state, install],
  );
};
