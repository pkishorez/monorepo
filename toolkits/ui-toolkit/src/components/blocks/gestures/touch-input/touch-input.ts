/** The attribute a control keeps its own touch handling with, such as a slider. */
export const NO_GESTURE_ATTRIBUTE = 'data-nogesture';

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
 * ended a real Gesture, so it must not also click what is under it.
 */
export type PointerSink = {
  readonly down: (sample: PointerSample) => void;
  readonly move: (sample: PointerSample) => void;
  readonly up: (sample: PointerSample) => boolean;
  /** The browser took the touch, or the page lost focus: end it as interrupted. */
  readonly cancelAll: () => void;
};

// Text entry keeps its own touch handling: selecting and caret dragging.
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';
const OWN_HANDLING = `${TEXT_ENTRY}, [${NO_GESTURE_ATTRIBUTE}]`;

const STYLE_ID = 'kui-gesture-zone';

// The browser decides what a touch may pan or zoom as the finger lands, so
// the zone keeps every touch in it from the browser.
const RULES = `${ZONE_SELECTOR} { touch-action: none; }`;

const installStyle = (doc: Document) => {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = RULES;
  doc.head.appendChild(style);
};

const handlesItself = (target: EventTarget | null) =>
  !(target instanceof Element) || target.closest(OWN_HANDLING) !== null;

const isTextEntry = (target: EventTarget | null) =>
  target instanceof Element && target.closest(TEXT_ENTRY) !== null;

const sampleOf = (event: PointerEvent): PointerSample => ({
  id: event.pointerId,
  x: event.clientX,
  y: event.clientY,
  t: event.timeStamp,
});

/** A release that ended a Gesture over a link or button must not also click it. */
const swallowNextClick = (win: Window) => {
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

/**
 * Makes `element` a Gesture Zone: every touch in it is kept from the browser
 * and fed to `sink`, except in text entry or under `data-nogesture`. Moves
 * and releases are read from the window, so a mouse that leaves the element
 * mid-Gesture is still followed. The browser taking a touch, such as for
 * the system back gesture, or leaving the page mid-touch cancels every
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

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (handlesItself(event.target)) return;
    tracked.add(event.pointerId);
    sink.down(sampleOf(event));
  };
  const onMove = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) sink.move(sampleOf(event));
  };
  const onUp = (event: PointerEvent) => {
    if (!tracked.delete(event.pointerId)) return;
    if (sink.up(sampleOf(event))) swallowNextClick(win);
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
  // Backs up touch-action where a browser still scrolls or zooms: iOS Safari
  // pinch-zooms the page from its own gesture events.
  const onTouchMove = (event: TouchEvent) => {
    if (event.cancelable && tracked.size > 0) event.preventDefault();
  };
  const onSafariGesture = (event: Event) => event.preventDefault();

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('gesturestart', onSafariGesture);
  win.addEventListener('pointermove', onMove);
  win.addEventListener('pointerup', onUp);
  win.addEventListener('pointercancel', onCancel);
  win.addEventListener('blur', onAway);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('gesturestart', onSafariGesture);
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    win.removeEventListener('blur', onAway);
    doc.removeEventListener('visibilitychange', onVisibility);
    onAway();
  };
};
