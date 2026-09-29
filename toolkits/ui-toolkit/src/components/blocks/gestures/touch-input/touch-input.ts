import { isTextEntry, nativeScrollKeeps, zoneGestureOf } from './native-scroll';

/** How the Gesture Zone's element is marked. */
export const ZONE_SELECTOR = '[data-slot="gesture-zone"]';

/** One pointer's position in viewport px at time `t` in ms. */
export type PointerSample = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

/**
 * What the zone does with its pointers. `up` returns whether the release
 * must not also click what is under it.
 */
export type PointerSink = {
  /** Whether a Hold is on: the zone then captures every touch. */
  readonly holding: () => boolean;
  readonly down: (sample: PointerSample) => void;
  readonly move: (sample: PointerSample) => void;
  readonly up: (sample: PointerSample) => boolean;
  /** The browser took the touch, or the page lost focus: end it as interrupted. */
  readonly cancelAll: () => void;
};

const STYLE_ID = 'kui-gesture-zone';

// The browser decides what a touch may do as the finger lands. The zone lets
// it pan, so a Native Scroll can keep a touch, and takes the rest at the
// first movement. Nothing in the zone zooms the page.
const RULES = `${ZONE_SELECTOR} { touch-action: pan-x pan-y; }`;

const installStyle = (doc: Document) => {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = RULES;
  doc.head.appendChild(style);
};

const sampleOf = (event: PointerEvent): PointerSample => ({
  id: event.pointerId,
  x: event.clientX,
  y: event.clientY,
  t: event.timeStamp,
});

// How long a swallowed release waits for its click. Mobile browsers send
// it a moment after the finger lifts, sometimes after other tasks.
const CLICK_WAIT_MS = 600;

/**
 * A release over a link or button that must not also click it. The click
 * arrives later than the release, so it is swallowed until it comes, the
 * next finger lands, or CLICK_WAIT_MS passes.
 */
const swallowNextClick = (win: Window) => {
  const stop = () => {
    win.removeEventListener('click', swallow, { capture: true });
    win.removeEventListener('pointerdown', stop, { capture: true });
    win.clearTimeout(timer);
  };
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  win.addEventListener('click', swallow, { capture: true });
  win.addEventListener('pointerdown', stop, { capture: true });
  const timer = win.setTimeout(stop, CLICK_WAIT_MS);
};

/**
 * Makes `element` a Gesture Zone and feeds its pointers to `sink`. Touches
 * where the zone is disabled, and in text entry, are left alone. At a
 * touch's first movement the zone captures it, unless it is one finger with
 * no Hold that a Native Scroll keeps: then the browser scrolls, every
 * pointer is cancelled, and the zone takes nothing until every finger lifts.
 * Moves and releases are read from the window, so a mouse that leaves the
 * element mid-Gesture is still followed. The browser taking a touch, such as
 * for the system back gesture, or leaving the page mid-touch cancels every
 * pointer. Returns the unbind.
 */
export const bindTouchInput = (
  element: HTMLElement,
  sink: PointerSink,
): (() => void) => {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  installStyle(doc);
  const tracked = new Set<number>();
  // Where each finger on the zone landed, until the touch is decided.
  const landed = new Map<number, { x: number; y: number }>();
  // Who the fingers on the screen belong to, decided at their first movement.
  let owner: 'undecided' | 'zone' | 'browser' = 'undecided';
  // A finger's release must not click: cancel the touch's end too, which
  // stops the browser's click and mouse events for it altogether.
  let swallowing = false;

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (owner === 'browser' || zoneGestureOf(event.target) === 'disabled') {
      return;
    }
    tracked.add(event.pointerId);
    sink.down(sampleOf(event));
  };
  const onMove = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) sink.move(sampleOf(event));
  };
  const onUp = (event: PointerEvent) => {
    if (!tracked.delete(event.pointerId)) return;
    if (!sink.up(sampleOf(event))) return;
    swallowNextClick(win);
    if (event.pointerType !== 'mouse') swallowing = true;
  };
  const onCancel = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) onAway();
  };
  const onAway = () => {
    tracked.clear();
    sink.cancelAll();
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') onAway();
  };
  // A long press opens the callout menu on touch; the app owns the touch here.
  const onContextMenu = (event: Event) => {
    const pointerType = (event as Partial<PointerEvent>).pointerType;
    if (pointerType !== 'mouse' && !isTextEntry(event.target)) {
      event.preventDefault();
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    // A swallow meant for a touch whose end came first must not reach this one.
    swallowing = false;
    for (const touch of event.changedTouches) {
      landed.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
  };
  // The fingers on screen that landed in the zone.
  const onZone = (event: TouchEvent) =>
    [...event.touches].filter(
      (touch) => touch.target instanceof Node && element.contains(touch.target),
    );
  const decide = (event: TouchEvent) => {
    const touches = onZone(event);
    const [touch] = touches;
    const start =
      touch === undefined ? undefined : landed.get(touch.identifier);
    if (touches.length !== 1 || start === undefined || sink.holding()) {
      return 'zone';
    }
    const zoneGesture = zoneGestureOf(touch.target);
    if (zoneGesture === 'disabled') return 'browser';
    if (zoneGesture === 'enabled') return 'zone';
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    return nativeScrollKeeps(touch.target, element, dx, dy)
      ? 'browser'
      : 'zone';
  };
  const onTouchMove = (event: TouchEvent) => {
    if (owner === 'undecided') {
      owner = decide(event);
      if (owner === 'browser' && tracked.size > 0) onAway();
    }
    if (owner === 'zone' && event.cancelable) event.preventDefault();
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (swallowing && event.type === 'touchend' && event.cancelable) {
      event.preventDefault();
    }
    swallowing = false;
    for (const touch of event.changedTouches) landed.delete(touch.identifier);
    if (onZone(event).length === 0) {
      landed.clear();
      owner = 'undecided';
    }
  };
  // iOS Safari pinch-zooms the page from its own gesture events.
  const onSafariGesture = (event: Event) => event.preventDefault();

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('touchend', onTouchEnd);
  element.addEventListener('touchcancel', onTouchEnd);
  element.addEventListener('gesturestart', onSafariGesture);
  win.addEventListener('pointermove', onMove);
  win.addEventListener('pointerup', onUp);
  win.addEventListener('pointercancel', onCancel);
  win.addEventListener('blur', onAway);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('touchend', onTouchEnd);
    element.removeEventListener('touchcancel', onTouchEnd);
    element.removeEventListener('gesturestart', onSafariGesture);
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    win.removeEventListener('blur', onAway);
    doc.removeEventListener('visibilitychange', onVisibility);
    onAway();
  };
};
