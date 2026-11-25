import { Effect, Layer, Stream, SubscriptionRef } from 'effect';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import type { NewBuildState } from './new-build.ts';

/*
 * `OnOutdated` over the New build fake's state: what an app does when it
 * finds it is older than what it talks to, as `updateToNewest` does with a
 * PWA, with no service worker.
 *
 * 1. Ask     once per page load: asked again, it does nothing more.
 * 2. Wait    for a newer build to be out, as the PWA waits for one to be
 *            downloaded: with none, nothing happens.
 * 3. Move    the page is the newest build from then on, so nothing newer
 *            is out; a notice says so on the page, and after
 *            `RELOAD_AFTER` the page reloads into it.
 */

/** How long the notice shows before the page reloads, in ms. */
export const RELOAD_AFTER = 1_500;

/** What the notice says while the page moves. */
export const MOVING = 'Moving to the newest build…';

/** A notice at the foot of the page, over the app; nothing outside a browser. */
const notice = (text: string): void => {
  if (typeof document === 'undefined') return;
  const element = document.createElement('div');
  element.setAttribute('role', 'status');
  element.dataset['kestackFake'] = 'new-build';
  element.textContent = text;
  Object.assign(element.style, {
    position: 'fixed',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    zIndex: '2147483000',
    padding: '10px 16px',
    borderRadius: '8px',
    background: '#111',
    color: '#fff',
    font: '14px/1.4 system-ui, sans-serif',
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.25)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(element);
};

/** `OnOutdated` over the fake's state; a Reference, so the Layer names no Service an app must have. */
export const outdatedOver = (
  state: SubscriptionRef.SubscriptionRef<NewBuildState>,
) =>
  Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the New build fake')),
    Layer.effect(
      OnOutdated,
      Effect.gen(function* () {
        const scope = yield* Effect.scope;

        // 2. Wait, 3. Move
        const move = Effect.gen(function* () {
          yield* SubscriptionRef.changes(state).pipe(
            Stream.filter(({ newer }) => newer),
            Stream.take(1),
            Stream.runDrain,
          );
          yield* SubscriptionRef.set(state, { newer: false });
          notice(MOVING);
          yield* Effect.sleep(RELOAD_AFTER);
          window.location.reload();
        });

        // 1. Ask
        let asked = false;
        return Effect.suspend(() => {
          if (asked) return Effect.void;
          asked = true;
          return Effect.asVoid(Effect.forkIn(move, scope));
        });
      }),
    ),
  );
