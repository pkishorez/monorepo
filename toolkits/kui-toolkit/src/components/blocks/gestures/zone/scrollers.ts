const SCROLLS = new Set(['auto', 'scroll']);
const PANS_SIDEWAYS = /pan-(x|left|right)/;

/**
 * Whether an element scrolls sideways on its own, going by its CSS: an
 * `overflow-x` that scrolls with content wider than the box, or a
 * `touch-action` that pans sideways. A touch that starts in one is its own.
 */
export const isNativeScroller = (element: Element): boolean => {
  const win = element.ownerDocument.defaultView ?? window;
  const style = win.getComputedStyle(element);
  return (
    (SCROLLS.has(style.getPropertyValue('overflow-x')) &&
      element.scrollWidth > element.clientWidth) ||
    PANS_SIDEWAYS.test(style.getPropertyValue('touch-action'))
  );
};

/** The native scroller a touch on `target` starts in, looking up to `zone` but not at it. */
export const nativeScrollerAt = (
  target: Element,
  zone: Element,
): Element | undefined => {
  for (
    let node: Element | null = target;
    node !== null && node !== zone;
    node = node.parentElement
  ) {
    if (isNativeScroller(node)) return node;
  }
  return undefined;
};

/** Every native scroller inside `zone`. Reads every element's style, so call it sparingly. */
export const nativeScrollers = (zone: Element): ReadonlyArray<Element> =>
  [...zone.querySelectorAll('*')].filter(isNativeScroller);

type Axis = 'x' | 'y';

const scrollsAlong = (element: Element, axis: Axis): boolean => {
  const win = element.ownerDocument.defaultView ?? window;
  const overflow = win
    .getComputedStyle(element)
    .getPropertyValue(axis === 'y' ? 'overflow-y' : 'overflow-x');
  return axis === 'y'
    ? SCROLLS.has(overflow) && element.scrollHeight > element.clientHeight
    : SCROLLS.has(overflow) && element.scrollWidth > element.clientWidth;
};

/**
 * The finger directions in which a touch on `target` cannot scroll along
 * `axis`, because its scroller is at that end: at the top, a finger moving
 * down scrolls nothing. The scroller is the nearest ancestor that scrolls
 * along the axis, however far out, so a row zone inside a feed sees the feed;
 * with none, both ends count.
 */
export const scrollEnds = (
  target: Element,
  axis: Axis,
): ReadonlyArray<'up' | 'down' | 'left' | 'right'> => {
  let scroller: Element | undefined;
  for (
    let node: Element | null = target;
    node !== null;
    node = node.parentElement
  ) {
    if (scrollsAlong(node, axis)) {
      scroller = node;
      break;
    }
  }
  if (scroller === undefined) {
    return axis === 'y' ? ['up', 'down'] : ['left', 'right'];
  }
  const ends: Array<'up' | 'down' | 'left' | 'right'> = [];
  if (axis === 'y') {
    if (scroller.scrollTop <= 0) ends.push('down');
    if (
      scroller.scrollTop + scroller.clientHeight >=
      scroller.scrollHeight - 1
    ) {
      ends.push('up');
    }
  } else {
    if (scroller.scrollLeft <= 0) ends.push('right');
    if (
      scroller.scrollLeft + scroller.clientWidth >=
      scroller.scrollWidth - 1
    ) {
      ends.push('left');
    }
  }
  return ends;
};
