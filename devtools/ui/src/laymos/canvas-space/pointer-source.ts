import {
  createGestureProvider,
  type GestureListener,
  type PointerSample,
  type PointerSink,
  type Pointers,
  type ZoneTree,
} from '@kstackz/use-gesture';

export type Target = Element | null;
export type SpaceListener = GestureListener<Target>;
export type SpacePointers = Pointers<Target>;

/** Marks an element as a zone of the space's Gesture Provider. */
export const zoneAttribute = 'data-space-zone';

const zoneOf = (target: Target) =>
  target?.closest(`[${zoneAttribute}]`) ?? null;

const spaceZones: ZoneTree<Element, Target> = {
  zoneOf,
  parentOf: (zone) => zoneOf(zone.parentElement),
  trapped: () => false,
};

export function createSpaceGestures() {
  return createGestureProvider(spaceZones);
}

export type SpaceGestures = ReturnType<typeof createSpaceGestures>;

// Pointers landing here are left to the element: typing, choosing.
const leftAlone = 'input, textarea, select, [data-space-ignore]';

const sampleOf = (event: PointerEvent): PointerSample<Target> => ({
  id: event.pointerId,
  x: event.clientX,
  y: event.clientY,
  t: event.timeStamp,
  target: event.target instanceof Element ? event.target : null,
});

/**
 * Feeds every pointer landing in `element` (mouse, pen and touch) to the
 * space's Gesture Provider. use-gesture's own browser source in
 * web-platform reads only touch and pen and leaves the mouse to the
 * browser, so the space reads pointers itself. Moves and releases are
 * followed on the window, so a drag may leave the element.
 */
export function listenToPointers(
  element: HTMLElement,
  sink: PointerSink<Target>,
): () => void {
  const win = element.ownerDocument.defaultView ?? window;
  const tracked = new Set<number>();

  const onMove = (event: PointerEvent) => {
    if (tracked.has(event.pointerId)) sink.move(sampleOf(event));
  };
  const onUp = (event: PointerEvent) => {
    if (!tracked.delete(event.pointerId)) return;
    if (sink.up(sampleOf(event))) swallowNextClick(win);
    if (tracked.size === 0) unwatch();
  };
  const onCancel = (event: PointerEvent | FocusEvent) => {
    if (tracked.size === 0) return;
    tracked.clear();
    sink.cancelAll(event.timeStamp);
    unwatch();
  };
  const watch = () => {
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onCancel);
    win.addEventListener('blur', onCancel);
  };
  const unwatch = () => {
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    win.removeEventListener('blur', onCancel);
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(leftAlone)) {
      return;
    }
    if (!sink.down(sampleOf(event))) return;
    tracked.add(event.pointerId);
    if (tracked.size === 1) watch();
  };

  element.addEventListener('pointerdown', onDown);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    unwatch();
  };
}

/** A release that moved something must not also click what is under it. */
function swallowNextClick(win: Window) {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const stop = () => {
    win.removeEventListener('click', swallow, { capture: true });
    win.removeEventListener('pointerdown', stop, { capture: true });
    win.clearTimeout(timer);
  };
  win.addEventListener('click', swallow, { capture: true });
  win.addEventListener('pointerdown', stop, { capture: true });
  // The click follows the release at once; one that never comes is not waited on.
  const timer = win.setTimeout(stop, 300);
}

interface Spread {
  readonly x: number;
  readonly y: number;
  /** Mean distance of the fingers from their centre; 0 for one finger. */
  readonly spread: number;
  readonly count: number;
}

/** Where the fingers still down are, together. */
export function spreadOf(pointers: SpacePointers): Spread | undefined {
  const live = [...pointers.values()].filter(
    (pointer) => pointer.end === undefined,
  );
  if (live.length === 0) return undefined;
  const x = live.reduce((sum, pointer) => sum + pointer.x, 0) / live.length;
  const y = live.reduce((sum, pointer) => sum + pointer.y, 0) / live.length;
  const spread =
    live.length < 2
      ? 0
      : live.reduce(
          (sum, pointer) => sum + Math.hypot(pointer.x - x, pointer.y - y),
          0,
        ) / live.length;
  return { x, y, spread, count: live.length };
}
