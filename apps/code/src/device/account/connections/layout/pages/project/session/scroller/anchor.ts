/*
 * Where the reader is in what a scroller holds: at the bottom, or at the
 * block at the top of the view, so far below the view's top. Put back
 * after anything in it grows or shrinks, the view moves by as much as the
 * block did, so what is on the screen stays where it was.
 */

export type Anchor =
  | { readonly at: 'bottom' }
  | { readonly at: 'block'; readonly id: string; readonly offset: number };

export const BOTTOM: Anchor = { at: 'bottom' };

/**
 * Closer than this to the bottom is at the bottom, in px: a glide that ends
 * a little short, or a block drawn a few px taller, still follows. No more
 * than a line, so one `k` up from the bottom is away from it.
 */
export const NEAR = 48;

/** How far the view is above the bottom of what it holds, in px. */
export const gapOf = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

/** Where the view is now: the bottom, or the first block not wholly above it. */
export const anchorOf = (scroller: HTMLElement): Anchor =>
  gapOf(scroller) < NEAR ? BOTTOM : blockAt(scroller);

/** The first block not wholly above the view, however near the bottom; the bottom with none. */
export const blockAt = (scroller: HTMLElement): Anchor => {
  const view = scroller.getBoundingClientRect();
  const block = hit(scroller, view) ?? search(scroller, view.top);
  return block === undefined
    ? BOTTOM
    : {
        at: 'block',
        id: block.dataset.block!,
        offset: block.getBoundingClientRect().top - view.top,
      };
};

/** How far apart, in px, the points are where `hit` looks for a block, down from the view's top: less than the gap between two. */
const STEP = 8;

/**
 * The block at the view's top, found where it is drawn, a few points down
 * past any gap. A group still skipped is found as itself, its blocks not
 * drawn yet: the block is the first of its own not wholly above the view.
 */
const hit = (scroller: HTMLElement, view: DOMRect) => {
  const x = view.left + view.width / 2;
  for (let y = view.top + 1; y < view.top + STEP * 8; y += STEP) {
    const at = document.elementFromPoint(x, y);
    if (!at || !scroller.contains(at)) continue;
    const block =
      at.closest<HTMLElement>('[data-block]') ??
      [
        ...(at
          .closest('[data-blocks]')
          ?.querySelectorAll<HTMLElement>('[data-block]') ?? []),
      ].find((each) => each.getBoundingClientRect().bottom > view.top);
    if (block) return block;
  }
  return undefined;
};

/** The first block not wholly above `top`, by halves through every block. */
const search = (scroller: HTMLElement, top: number) => {
  const blocks = scroller.querySelectorAll<HTMLElement>('[data-block]');
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (blocks[middle]!.getBoundingClientRect().bottom <= top) low = middle + 1;
    else high = middle;
  }
  return blocks[low];
};

/** Moves the view back to the anchor; false while its block is not there. */
export const putBack = (
  scroller: HTMLElement,
  anchor: Anchor,
  blockOf: (id: string) => HTMLElement | undefined,
): boolean => {
  if (anchor.at === 'bottom') {
    if (gapOf(scroller) > 0.5) scroller.scrollTop = scroller.scrollHeight;
    return true;
  }
  const block = blockOf(anchor.id);
  if (block === undefined) return false;
  const moved =
    block.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    anchor.offset;
  if (Math.abs(moved) >= 0.5) scroller.scrollTop += moved;
  return true;
};

/** An anchor as history kept it, or none. */
export const keptAnchor = (kept: unknown): Anchor | null => {
  if (typeof kept !== 'object' || kept === null) return null;
  const { at, id, offset } = kept as Record<string, unknown>;
  if (at === 'bottom') return BOTTOM;
  return at === 'block' && typeof id === 'string' && typeof offset === 'number'
    ? { at, id, offset }
    : null;
};
