import { isTextEntry, nativeScrollKeeps, zoneGestureOf } from './native-scroll';

/** How a Gesture Zone's element is marked. */
export const ZONE_SELECTOR = '[data-slot="gesture-zone"]';

/** Set on a trapped zone: Gestures that start in it go no further up. */
export const TRAPPED_ATTRIBUTE = 'data-trapped';

/** The innermost Gesture Zone around `target`, if any. */
export const zoneOf = (target: EventTarget | null | undefined) =>
  target instanceof Element ? target.closest(ZONE_SELECTOR) : null;

/** One pointer's position in viewport px at time `t` in ms, and what it landed on. */
export type PointerSample = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly target: Element | null;
};

/**
 * What the provider does with the pointers. `down` returns whether the
 * pointer is now tracked; `up` whether its release must not also click what
 * is under it.
 */
export type PointerSink = {
  /** Whether a Gesture is under way. */
  readonly active: () => boolean;
  readonly down: (sample: PointerSample) => boolean;
  readonly move: (sample: PointerSample) => void;
  readonly up: (sample: PointerSample) => boolean;
  /** The browser took the touch, or the page lost focus: end it as interrupted. */
  readonly cancelAll: () => void;
  /** Whether a listener of the Gesture under way captures its touch, even over a Native Scroll. */
  readonly captures: () => boolean;
};

const STYLE_ID = 'kui-gesture-zone';

/**
 * How far from a side edge, in px, a touch in a zone is kept from the
 * browser's own edge swipe: back and forward on iOS, in Safari and installed.
 */
export const EDGE_GUARD_PX = 24;

// Taps on these must still click, so their touches are left to the browser.
const INTERACTIVE =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

/**
 * Whether a touch landing at `x` on `target` must be kept from the browser's
 * edge swipe: it lands in a zone, within EDGE_GUARD_PX of a side edge, on
 * nothing that is turned off for the zone or must still click.
 */
export const guardsEdge = (
  target: EventTarget | null,
  x: number,
  width: number,
) =>
  (x <= EDGE_GUARD_PX || x >= width - EDGE_GUARD_PX) &&
  zoneOf(target) !== null &&
  zoneGestureOf(target) !== 'disabled' &&
  !(target instanceof Element && target.closest(INTERACTIVE) !== null);

// The browser decides what a touch may do as the finger lands. A zone lets
// it pan, so a Native Scroll can keep a touch, and takes the rest at the
// first movement. Nothing in a zone zooms the page.
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
  target: event.target instanceof Element ? event.target : null,
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
 * Feeds every pointer on the page to `sink`, for one Gesture Provider. It
 * listens on the window in the capture phase, so nothing inside a zone can
 * hide a finger from it. Fingers where the zone is disabled, and in text
 * entry, are left alone. Moves and releases of tracked pointers follow
 * them anywhere. The browser taking a touch, such as for a Native Scroll or
 * the system back gesture, or the page going away mid-touch, cancels every
 * pointer.
 *
 * Holding the browser back has to happen on each zone's own element, since
 * a blocking touch listener on the whole page would make every scroll wait:
 * `bindZone` adds it. At a touch's first movement the Gesture keeps it,
 * unless it is one finger that a Native Scroll keeps: then the browser
 * scrolls, the Gesture is cancelled, and nothing is tracked until every
 * finger lifts.
 */
export const createTouchInput = (win: Window, sink: PointerSink) => {
  const doc = win.document;
  const tracked = new Set<number>();
  // Where each finger on the screen landed, until the touch is decided.
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
    if (sink.down(sampleOf(event))) tracked.add(event.pointerId);
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
  // A long press opens the callout menu on touch; the app owns touch in a zone.
  const onContextMenu = (event: Event) => {
    const pointerType = (event as Partial<PointerEvent>).pointerType;
    if (
      pointerType !== 'mouse' &&
      zoneOf(event.target) !== null &&
      !isTextEntry(event.target)
    ) {
      event.preventDefault();
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    // A swallow meant for a touch whose end came first must not reach this one.
    swallowing = false;
    for (const touch of event.changedTouches) {
      landed.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      // iOS starts its back and forward swipe from here, before any touchmove
      // the zone could hold back; only a touchstart kept from it stops that.
      if (
        event.cancelable &&
        guardsEdge(touch.target, touch.clientX, win.innerWidth)
      ) {
        event.preventDefault();
      }
    }
  };
  const decide = (event: TouchEvent) => {
    const touches = [...event.touches];
    const [touch] = touches;
    if (touches.length !== 1 || touch === undefined) return 'zone';
    const start = landed.get(touch.identifier);
    if (start === undefined) return 'zone';
    const zone = zoneOf(touch.target);
    if (zone === null) return 'zone';
    if (zoneGestureOf(touch.target) === 'enabled') return 'zone';
    if (sink.captures()) return 'zone';
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    return nativeScrollKeeps(touch.target, zone, dx, dy) ? 'browser' : 'zone';
  };
  // From each zone's element: keeps a Gesture's touch from the browser.
  const onTouchMove = (event: TouchEvent) => {
    if (!sink.active()) return;
    if (owner === 'undecided') {
      owner = decide(event);
      if (owner === 'browser') onAway();
    }
    if (owner === 'zone' && event.cancelable) event.preventDefault();
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (swallowing && event.type === 'touchend' && event.cancelable) {
      event.preventDefault();
    }
    swallowing = false;
    for (const touch of event.changedTouches) landed.delete(touch.identifier);
    if (event.touches.length === 0) {
      landed.clear();
      owner = 'undecided';
    }
  };
  // iOS Safari pinch-zooms the page from its own gesture events.
  const onSafariGesture = (event: Event) => event.preventDefault();

  return {
    /** Starts listening to the page. */
    start: () => {
      installStyle(doc);
      win.addEventListener('pointerdown', onDown, { capture: true });
      win.addEventListener('pointermove', onMove, { capture: true });
      win.addEventListener('pointerup', onUp, { capture: true });
      win.addEventListener('pointercancel', onCancel, { capture: true });
      win.addEventListener('contextmenu', onContextMenu, { capture: true });
      win.addEventListener('touchstart', onTouchStart, {
        capture: true,
        passive: false,
      });
      win.addEventListener('touchend', onTouchEnd, {
        capture: true,
        passive: false,
      });
      win.addEventListener('touchcancel', onTouchEnd, { capture: true });
      win.addEventListener('blur', onAway);
      doc.addEventListener('visibilitychange', onVisibility);
    },
    /** Stops listening, cancelling any Gesture under way. */
    stop: () => {
      win.removeEventListener('pointerdown', onDown, { capture: true });
      win.removeEventListener('pointermove', onMove, { capture: true });
      win.removeEventListener('pointerup', onUp, { capture: true });
      win.removeEventListener('pointercancel', onCancel, { capture: true });
      win.removeEventListener('contextmenu', onContextMenu, { capture: true });
      win.removeEventListener('touchstart', onTouchStart, { capture: true });
      win.removeEventListener('touchend', onTouchEnd, { capture: true });
      win.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      win.removeEventListener('blur', onAway);
      doc.removeEventListener('visibilitychange', onVisibility);
      onAway();
    },
    /** Holds the browser back from a zone's element; returns the unbind. */
    bindZone: (element: Element) => {
      element.addEventListener('touchmove', onTouchMove as EventListener, {
        passive: false,
      });
      element.addEventListener('gesturestart', onSafariGesture);
      return () => {
        element.removeEventListener('touchmove', onTouchMove as EventListener);
        element.removeEventListener('gesturestart', onSafariGesture);
      };
    },
  };
};

export type TouchInput = ReturnType<typeof createTouchInput>;
