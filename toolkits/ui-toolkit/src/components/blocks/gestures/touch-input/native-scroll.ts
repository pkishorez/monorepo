/**
 * The attribute any element in the zone decides the zone's hold on touch
 * with, for itself and what it holds; the nearest one decides. `enabled`:
 * the zone captures every touch there, even over something that scrolls.
 * `disabled`: the zone never takes a touch there. Without one, the zone
 * captures every touch except one a scrollable element keeps.
 */
export const ZONE_GESTURE_ATTRIBUTE = 'data-zone-gesture';

/** How the zone treats a touch that lands on an element. */
export type ZoneGesture = 'enabled' | 'disabled' | 'auto';

// Text entry keeps its own touch handling: selecting and caret dragging.
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';

export const isTextEntry = (target: EventTarget | null) =>
  target instanceof Element && target.closest(TEXT_ENTRY) !== null;

/** How the zone treats a touch landing on `target`. */
export const zoneGestureOf = (target: EventTarget | null): ZoneGesture => {
  if (!(target instanceof Element) || isTextEntry(target)) return 'disabled';
  const value = target
    .closest(`[${ZONE_GESTURE_ATTRIBUTE}]`)
    ?.getAttribute(ZONE_GESTURE_ATTRIBUTE);
  return value === 'enabled' || value === 'disabled' ? value : 'auto';
};

const SCROLLS = new Set(['auto', 'scroll', 'overlay']);

// Whether `element` can still scroll to follow a finger moving by dx, dy
// along its main direction. A finger moving up scrolls the content down.
const followsFinger = (element: Element, dx: number, dy: number) => {
  const style = getComputedStyle(element);
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (!SCROLLS.has(style.overflowY)) return false;
    const end = element.scrollHeight - element.clientHeight;
    return dy < 0 ? element.scrollTop < end - 1 : element.scrollTop > 0;
  }
  if (!SCROLLS.has(style.overflowX)) return false;
  const end = element.scrollWidth - element.clientWidth;
  const left = Math.abs(element.scrollLeft);
  return dx < 0 ? left < end - 1 : left > 0;
};

/**
 * Whether a Native Scroll keeps a finger that landed on `target` and first
 * moved by dx, dy: some element from it up to `zone` can still scroll that
 * way.
 */
export const nativeScrollKeeps = (
  target: EventTarget | null,
  zone: Element,
  dx: number,
  dy: number,
) => {
  if (dx === 0 && dy === 0) return false;
  for (
    let element = target instanceof Element ? target : null;
    element !== null;
    element = element.parentElement
  ) {
    if (followsFinger(element, dx, dy)) return true;
    if (element === zone) return false;
  }
  return false;
};
