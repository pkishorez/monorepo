export function centerInNearestScrollContainer(element: HTMLElement) {
  const container = nearestScrollContainer(element);
  if (container === undefined) return;

  const containerBounds = container.getBoundingClientRect();
  const elementBounds = element.getBoundingClientRect();
  const top =
    container.scrollTop +
    elementBounds.top -
    containerBounds.top -
    (container.clientHeight - elementBounds.height) / 2;

  container.scrollTo({ top, behavior: 'smooth' });
}

function nearestScrollContainer(element: HTMLElement): HTMLElement | undefined {
  let parent = element.parentElement;
  while (parent !== null) {
    const overflow = getComputedStyle(parent).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return undefined;
}
