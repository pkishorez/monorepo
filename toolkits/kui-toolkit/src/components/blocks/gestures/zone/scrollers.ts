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
