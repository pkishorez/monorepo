import {
  directionOf,
  type PointerSample,
  type PointerSink,
  type ZoneTree,
} from '../../../index.ts';
import {
  isTextEntry,
  nativeScrollKeeps,
  zoneGestureOf,
} from './native-scroll.ts';

/** How a Gesture Zone's element is marked. */
export const ZONE_SELECTOR = '[data-slot="gesture-zone"]';

/** Set on a trapped zone: Gestures that start in it go no further up. */
export const TRAPPED_ATTRIBUTE = 'data-trapped';

/** The innermost Gesture Zone around `target`, if any. */
export const zoneOf = (target: EventTarget | null | undefined) =>
  target instanceof Element ? target.closest(ZONE_SELECTOR) : null;

/** A finger on the page: what it landed on is an element, if anything. */
export type Target = Element | null;

/**
 * How Gesture Zones nest in the page: each is an element marked
 * ZONE_SELECTOR, inside the zone around it, Trapped while it has
 * TRAPPED_ATTRIBUTE.
 */
export const DOM_ZONES: ZoneTree<Element, Target> = {
  zoneOf,
  parentOf: (zone) => zoneOf(zone.parentElement),
  trapped: (zone) => zone.hasAttribute(TRAPPED_ATTRIBUTE),
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
// it pan, so the browser can scroll whatever the zone does not take at the
// first movement. Nothing in a zone zooms the page.
const RULES = `${ZONE_SELECTOR} { touch-action: pan-x pan-y; }`;

const installStyle = (doc: Document) => {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = RULES;
  doc.head.appendChild(style);
};

const sampleOf = (event: PointerEvent): PointerSample<Target> => ({
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
 * Feeds every touch and pen pointer on the page to `sink`, for one Gesture
 * Provider; the mouse is left to the browser. It listens on the window in
 * the capture phase, so nothing inside a zone can hide a finger from it. Fingers where the zone is disabled, and in text
 * entry, are left alone. Moves and releases of tracked pointers follow
 * them anywhere. The browser taking a touch, such as for a Native Scroll or
 * the system back gesture, or the page going away mid-touch, cancels every
 * pointer.
 *
 * Holding the browser back has to happen on each zone's own element, since
 * a blocking touch listener on the whole page would make every scroll wait:
 * `bindZone` adds it. A touch's first movement reads its Direction and
 * decides who owns it: the zone when a listener takes it, or when two
 * fingers are down; otherwise the browser, which scrolls, while the Gesture
 * is cancelled and nothing is tracked until every finger lifts.
 */
export const createTouchInput = (win: Window, sink: PointerSink<Target>) => {
  const doc = win.document;
  // Each tracked pointer, with whether it is a finger and how to stop
  // listening on the element it landed on.
  const tracked = new Map<number, { touch: boolean; unwatch: () => void }>();
  const untrack = (id: number) => {
    const pointer = tracked.get(id);
    if (pointer === undefined) return false;
    pointer.unwatch();
    tracked.delete(id);
    return true;
  };
  // Where each finger on the screen landed, until the touch is decided.
  const landed = new Map<number, { x: number; y: number }>();
  // Who the fingers on the screen belong to, decided at their first movement.
  let owner: 'undecided' | 'zone' | 'browser' = 'undecided';
  // A finger's release must not click: cancel the touch's end too, which
  // stops the browser's click and mouse events for it altogether.
  let swallowing = false;

  const onDown = (event: PointerEvent) => {
    // A Gesture is touch or pen: a mouse drag selects text and never
    // scrolls, so the browser keeps it.
    if (event.pointerType === 'mouse') return;
    if (owner === 'browser' || zoneGestureOf(event.target) === 'disabled') {
      return;
    }
    if (!sink.down(sampleOf(event))) return;
    // iOS sends a finger's release to the element it landed on, even after
    // that element has left the page, and from there it never reaches the
    // window. Listening on the element itself still hears it.
    const target = event.target;
    target?.addEventListener('pointerup', onUp as EventListener);
    target?.addEventListener('pointercancel', onCancel as EventListener);
    tracked.set(event.pointerId, {
      touch: event.pointerType === 'touch',
      unwatch: () => {
        target?.removeEventListener('pointerup', onUp as EventListener);
        target?.removeEventListener('pointercancel', onCancel as EventListener);
      },
    });
  };
  const onMove = (event: PointerEvent) => {
    if (!tracked.has(event.pointerId)) return;
    // The browser sends a finger's pointermove before its touchmove: until
    // that decides, the move only moves.
    const undecided = owner === 'undecided' && landed.size > 0;
    sink.move({ ...sampleOf(event), undecided });
  };
  const onUp = (event: PointerEvent) => {
    if (!untrack(event.pointerId)) return;
    if (!sink.up(sampleOf(event))) return;
    swallowNextClick(win);
    swallowing = true;
  };
  const onCancel = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) onAway();
  };
  const onAway = () => {
    for (const id of [...tracked.keys()]) untrack(id);
    // Pointer events stamp their time on this clock.
    sink.cancelAll(performance.now());
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
    // More fingers tracked than are on the screen: a release went unheard,
    // so the Gesture under way is stale. End it rather than let the next
    // touch join it.
    const fingers = [...tracked.values()].filter((pointer) => pointer.touch);
    if (event.touches.length < fingers.length) onAway();
    for (const touch of event.changedTouches) {
      landed.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      // iOS starts its back and forward swipe from here, before any touchmove
      // the zone could hold back; only a touchstart kept from it stops that.
      const { clientX: x, clientY: y } = touch;
      if (
        event.cancelable &&
        guardsEdge(touch.target, x, win.innerWidth) &&
        sink.claimsEdge({ x, y }, x <= EDGE_GUARD_PX ? 'right' : 'left')
      ) {
        event.preventDefault();
      }
    }
  };
  // Who owns a touch, from its first movement; first match wins.
  const decide = (event: TouchEvent) => {
    const touches = [...event.touches];
    const [touch] = touches;
    const start = touch && landed.get(touch.identifier);
    const dx = touch && start ? touch.clientX - start.x : 0;
    const dy = touch && start ? touch.clientY - start.y : 0;
    const direction = sink.direction() ?? directionOf(dx, dy);
    const how = sink.pick(direction);
    const owner = ((): 'zone' | 'browser' => {
      if (touches.length !== 1 || touch === undefined) return 'zone';
      const zone = zoneOf(touch.target);
      if (zone === null) return 'zone';
      if (zoneGestureOf(touch.target) === 'enabled') return 'zone';
      if (how === 'captures') return 'zone';
      if (nativeScrollKeeps(touch.target, zone, dx, dy)) return 'browser';
      return how === 'directions' ? 'zone' : 'browser';
    })();
    // Only a touch the zone keeps has a Direction for its listeners: one the
    // browser scrolls must not start them moving before it cancels them.
    if (owner === 'zone') sink.settle(direction);
    return owner;
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
