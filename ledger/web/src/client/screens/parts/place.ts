/** Keeps the element marked with `[data-marked]` in `root` in view. */
export const scrollMarked = (root: HTMLElement) =>
  root
    .querySelector('[data-marked]')
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
