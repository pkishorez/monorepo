import { Effect, Layer } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import type { NewBuildFake, NewBuildMessage } from './actor.ts';

/*
 * `OnOutdated` over the running New build fake: what an app does when it
 * finds it is older than what it talks to, as `updateToNewest` does with a
 * PWA, with no service worker.
 *
 * 1. Ask     once per page load: asked again, it does nothing more.
 * 2. Wait    for a newer build to be out, as the PWA waits for one to be
 *            downloaded: with none, nothing happens.
 * 3. Move    the page is the newest build from then on (`Moved`, kept
 *            before the reload); a notice says so on the page, and after
 *            `RELOAD_AFTER` the page reloads into it.
 */

/** How long the notice shows before the page reloads, in ms. */
export const RELOAD_AFTER = 1_500;

/** What the notice says while the page moves. */
export const MOVING = 'Moving to the newest build…';

export interface NewBuildOptions {
  /** What reloads the page: `location.reload` unless given. */
  readonly reload?: () => void;
  /** Draws `text` on the page: a notice at the foot unless given. */
  readonly say?: (text: string) => void;
}

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

/** `OnOutdated` over the fake; a Reference, so the Layer names no Service an app must have. */
export const newBuildOver = (
  runtime: Runtime<typeof NewBuildFake>,
  {
    reload = () => window.location.reload(),
    say = notice,
  }: NewBuildOptions = {},
) =>
  Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the New build fake')),
    Layer.effect(
      OnOutdated,
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const root = runtime.root;
        const send = (message: NewBuildMessage) =>
          Effect.sync(() => void root.send(message));

        // 2. Wait, 3. Move
        const move = Effect.gen(function* () {
          yield* send({ _tag: 'MoveAsked' });
          yield* Effect.orDie(root.until(({ model }) => model.newer));
          yield* send({ _tag: 'Moved' });
          say(MOVING);
          yield* Effect.sleep(RELOAD_AFTER);
          reload();
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
