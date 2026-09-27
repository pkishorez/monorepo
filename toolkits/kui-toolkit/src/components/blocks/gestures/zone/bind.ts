import type { GestureEngine, PointerInput } from '../engine';

// Text entry keeps its own touch handling: selecting, caret dragging.
const OPTED_OUT =
  'input, textarea, select, [contenteditable="true"], [data-gestures="off"]';

const optedOut = (target: EventTarget | null) =>
  target instanceof Element && target.closest(OPTED_OUT) !== null;

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
 * `accepts` refuses (an edge strip) are never tracked, so the browser keeps
 * them. Moves and releases are read from the window, so a mouse that leaves
 * the element mid-gesture is still followed. The engine's deadlines are
 * scheduled as ticks on the same clock as event timestamps.
 */
export const bindPointers = (
  element: HTMLElement,
  engine: GestureEngine,
  accepts: (x: number, y: number) => boolean,
): (() => void) => {
  const win = element.ownerDocument.defaultView ?? window;
  const tracked = new Set<number>();
  let timer: number | undefined;

  const schedule = () => {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = undefined;
    const due = engine.nextDeadline();
    if (due === undefined) return;
    timer = win.setTimeout(
      () => {
        timer = undefined;
        engine.tick(Math.max(due, win.performance.now()));
        schedule();
      },
      Math.max(0, due - win.performance.now()),
    );
  };

  const feed = (input: PointerInput) => {
    engine.feed(input);
    schedule();
  };

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (optedOut(event.target) || !accepts(event.clientX, event.clientY)) {
      return;
    }
    tracked.add(event.pointerId);
    feed(sample(event, 'down'));
  };
  const onMove = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) feed(sample(event, 'move'));
  };
  const onEnd = (type: 'up' | 'cancel') => (event: PointerEvent) => {
    if (!tracked.delete(event.pointerId)) return;
    feed(sample(event, type));
  };
  const onUp = onEnd('up');
  const onCancel = onEnd('cancel');
  // Leaving the page mid-touch never delivers the release.
  const onAway = () => {
    tracked.clear();
    engine.cancelAll();
    schedule();
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

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('contextmenu', onContextMenu);
  win.addEventListener('pointermove', onMove);
  win.addEventListener('pointerup', onUp);
  win.addEventListener('pointercancel', onCancel);
  win.addEventListener('blur', onAway);
  win.document.addEventListener('visibilitychange', onVisibility);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('contextmenu', onContextMenu);
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    win.removeEventListener('blur', onAway);
    win.document.removeEventListener('visibilitychange', onVisibility);
    if (timer !== undefined) win.clearTimeout(timer);
    engine.cancelAll();
  };
};

/** A gesture that ends over a link or button must not also click it. */
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
