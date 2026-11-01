/*
 * How a scrolled element is named in the saved positions, as TanStack
 * Router names it, so its inline script and the Router agree: by its
 * `data-scroll-restoration-id`, else by its path from the document, each
 * step its tag and its place among its siblings. The window is `window`.
 */

export const WINDOW = 'window';
export const ID = 'data-scroll-restoration-id';

/** Where an element or the window was scrolled to. */
export interface Position {
  readonly scrollX: number;
  readonly scrollY: number;
  /**
   * Where a list that puts itself back says it was, in its own terms, as
   * the item at its top: anything JSON holds. Scroll restoration never
   * scrolls an element, or the window, that kept one.
   */
  readonly anchor?: unknown;
}

/** Every saved position: by restoration key, then by element. */
export type Positions = Record<string, Record<string, Position>>;

/** An element's name: `[data-scroll-restoration-id="list"]`, or `main:nth-child(2) > ul:nth-child(1)`. */
export const selectorOf = (element: Element): string => {
  const id = element.getAttribute(ID);
  if (id) return `[${ID}="${id}"]`;
  let selector = '';
  let at: Element = element;
  let parent: ParentNode | null;
  while ((parent = at.parentNode)) {
    let index = 1;
    let sibling: Element | null = at;
    while ((sibling = sibling.previousElementSibling)) index++;
    const part = `${at.localName}:nth-child(${index})`;
    selector = selector ? `${part} > ${selector}` : part;
    if (!(parent instanceof Element)) break;
    at = parent;
  }
  return selector;
};

/** The element a selector, or a function, names now; none if it is gone. */
export const elementOf = (
  selector: string | (() => Element | null | undefined),
): Element | undefined => {
  try {
    return (
      (typeof selector === 'function'
        ? selector()
        : document.querySelector(selector)) ?? undefined
    );
  } catch {
    return undefined;
  }
};
