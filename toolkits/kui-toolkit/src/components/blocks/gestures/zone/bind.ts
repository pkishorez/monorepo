import type { GestureEngine, PointerInput, TouchStart } from '../engine';
import { nativeScrollerAt } from './scrollers';

/** How a Gesture Zone's element is marked, so nested zones can tell whose a touch is. */
export const ZONE_SELECTOR = '[data-slot="gesture-zone"]';

// Text entry keeps its own touch handling: selecting, caret dragging.
const OPTED_OUT =
  'input, textarea, select, [contenteditable="true"], [data-gestures="off"]';

const optedOut = (target: EventTarget | null) =>
  target instanceof Element && target.closest(OPTED_OUT) !== null;

/**
 * A touch that starts in a text field, an opted-out subtree, a native
 * scroller or a Gesture Zone nested inside this one is theirs.
 */
const belongsElsewhere = (target: EventTarget | null, zone: Element) =>
  !(target instanceof Element) ||
  target.closest(ZONE_SELECTOR) !== zone ||
  optedOut(target) ||
  nativeScrollerAt(target, zone) !== undefined;

const sample = (
  event: PointerEvent,
  type: PointerInput['type'],
): PointerInput => ({
  id: event.pointerId,
  type,
  x: event.clientX,
  y: event.clientY,
  t: event.timeStamp,
});

/**
 * Feeds an element's pointer input to an engine. Pointers that go down where
 * `start` refuses (an edge strip no edge Swipe wants), or in something with
 * its own touch handling, are never tracked, so the browser keeps them. Moves and releases
 * are read from the window, so a mouse that leaves the element mid-gesture is
 * still followed. A Captured touch cannot scroll the page, and a finger
 * lifting from one does not also click what is under it.
 */
export const bindPointers = (
  element: HTMLElement,
  engine: GestureEngine,
  start: (event: PointerEvent) => TouchStart | undefined,
): (() => void) => {
  const win = element.ownerDocument.defaultView ?? window;
  const tracked = new Set<number>();
  const feed = (input: PointerInput) => engine.feed(input);

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (belongsElsewhere(event.target, element)) return;
    const touch = start(event);
    if (touch === undefined) return;
    tracked.add(event.pointerId);
    feed({ ...sample(event, 'down'), start: touch });
  };
  const onMove = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) feed(sample(event, 'move'));
  };
  const onEnd = (type: 'up' | 'cancel') => (event: PointerEvent) => {
    if (!tracked.delete(event.pointerId)) return;
    if (engine.captured()) swallowNextClick(win);
    feed(sample(event, type));
  };
  const onUp = onEnd('up');
  const onCancel = onEnd('cancel');
  // Leaving the page mid-touch never delivers the release.
  const onAway = () => {
    tracked.clear();
    engine.cancelAll();
  };
  const onVisibility = () => {
    if (win.document.visibilityState === 'hidden') onAway();
  };
  // A long press opens the callout menu on touch; the app owns holds here.
  const onContextMenu = (event: Event) => {
    const pointerType = (event as Partial<PointerEvent>).pointerType;
    if (pointerType !== 'mouse' && !optedOut(event.target)) {
      event.preventDefault();
    }
  };

  // Capture. touch-action cannot change mid-touch, so once the app owns the
  // touch, its moves are held back from the browser here. One the browser
  // already scrolls is not cancelable, and ends in pointercancel instead.
  const onTouchMove = (event: TouchEvent) => {
    if (event.cancelable && engine.captured()) event.preventDefault();
  };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  win.addEventListener('pointermove', onMove);
  win.addEventListener('pointerup', onUp);
  win.addEventListener('pointercancel', onCancel);
  win.addEventListener('blur', onAway);
  win.document.addEventListener('visibilitychange', onVisibility);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('touchmove', onTouchMove);
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    win.removeEventListener('blur', onAway);
    win.document.removeEventListener('visibilitychange', onVisibility);
    engine.cancelAll();
  };
};

/** A Captured touch that ends over a link or button must not also click it. */
export const swallowNextClick = (win: Window) => {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  win.addEventListener('click', swallow, { capture: true, once: true });
  win.setTimeout(
    () => win.removeEventListener('click', swallow, { capture: true }),
    0,
  );
};
