/** The first of `elements` in the document. */
export const firstElement = (elements: Iterable<HTMLElement>) =>
  [...elements]
    .filter((element) => element.isConnected)
    .toSorted((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )[0];

/** Whether DOM focus is in one of `elements`. */
export const focusIn = (elements: Iterable<HTMLElement>) => {
  const focused = document.activeElement;
  return [...elements].some((element) => element.contains(focused));
};

const targetOf = (event: Event) => {
  const target = event.composedPath()[0] ?? event.target;
  return target instanceof Element ? target : null;
};

/**
 * Follows the page: a pointer going down on an element, and DOM focus
 * moving to one, or to nowhere, as the page itself or out of the window.
 */
export const watchPage = (on: {
  readonly pointed: (target: Element | null) => void;
  readonly focused: (target: Element | null) => void;
}) => {
  const pointerdown = (event: PointerEvent) => on.pointed(targetOf(event));
  const focusin = (event: FocusEvent) => on.focused(targetOf(event));
  const focusout = (event: FocusEvent) => {
    if (event.relatedTarget === null) on.focused(null);
  };
  document.addEventListener('pointerdown', pointerdown, true);
  document.addEventListener('focusin', focusin, true);
  document.addEventListener('focusout', focusout, true);
  return () => {
    document.removeEventListener('pointerdown', pointerdown, true);
    document.removeEventListener('focusin', focusin, true);
    document.removeEventListener('focusout', focusout, true);
  };
};
