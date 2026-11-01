import { startTransition } from 'react';
import { flushSync } from 'react-dom';
import type { Anchor } from './anchor.ts';

/*
 * A session's scroll: where the reader is (`anchor`), and which of its
 * blocks are drawn. Told its blocks in order once (`plan`), it draws at
 * once enough around where the reader lands to fill the view twice over;
 * every other block stands in as space as tall as it was when last drawn,
 * from any visit since the app started, or as its guess. The rest are
 * drawn after, a view's worth at a time, those the reader nears first,
 * else from the bottom up, each batch once the last has landed, and only
 * while the reader is still, so nothing above the view changes height as
 * it moves. A block not told of, as one arriving after, is drawn at once;
 * nothing drawn is taken away.
 *
 * A block laid out once may be skipped by the browser while far from the
 * view (`content-visibility`), as tall as it was, so a resize, or the
 * sidebar sliding beside it, touches only the blocks in sight. A group of
 * blocks, an element marked `data-blocks`, is skipped as one box instead,
 * once its blocks are all drawn: the fewer boxes skipped, the fewer the
 * browser tracks as the view moves.
 */

/** A block as the list tells it: its id, and how tall it is guessed to be, in px. */
export interface Planned {
  readonly id: string;
  readonly guess: number;
}

export interface Blocks {
  /** Where the reader is. */
  anchor: Anchor;
  /** Whether it was told its blocks. */
  readonly planned: () => boolean;
  /** Told its blocks in order, the first time: draws those around the anchor, or at the bottom when it is none of them. */
  readonly plan: (order: () => ReadonlyArray<Planned>) => void;
  readonly isDrawn: (id: string) => boolean;
  /** How tall a block was when last drawn, in px. */
  readonly heightOf: (id: string) => number | undefined;
  readonly elementOf: (id: string) => HTMLElement | undefined;
  /** A block's element, and how to draw it; undone as it goes. */
  readonly register: (
    id: string,
    element: HTMLElement,
    draw: () => void,
  ) => () => void;
  /** A block drawn by a batch is on the page. */
  readonly landed: (id: string) => void;
  /** The reader moved: wait for them to be still before drawing more. */
  readonly moved: () => void;
  /** The first blocks drawn now, to go to the top. */
  readonly drawTop: () => void;
  /** Watches the page, `changed` after anything in it changes height. */
  readonly connect: (
    scroller: HTMLElement,
    content: HTMLElement,
    changed: () => void,
  ) => () => void;
}

/** How many blocks' heights are remembered. */
const REMEMBERED = 5000;

/** How tall each block was when last drawn, by its id, for as long as the app runs. */
const heights = new Map<string, number>();

const remember = (id: string, height: number) => {
  heights.delete(id);
  heights.set(id, height);
  if (heights.size > REMEMBERED) heights.delete(heights.keys().next().value!);
};

/** How long the reader is still before more is drawn, in ms. */
const STILL = 150;

/** How near the view a block stands in to be drawn next: two views above and below it. */
const NEAR_VIEW = '200% 0px';

/** Laid out as tall as `height`, it can be skipped while far from the view. */
const skippable = (element: HTMLElement, height: number) => {
  element.style.containIntrinsicBlockSize = `auto ${height}px`;
  element.style.contentVisibility = 'auto';
};

export const blocksOf = (anchor: Anchor): Blocks => {
  let order: ReadonlyArray<Planned> | null = null;
  const told = new Set<string>();
  const drawn = new Set<string>();
  const elements = new Map<string, HTMLElement>();
  const draws = new Map<string, () => void>();
  /** Drawn by the last batch, not on the page yet. */
  const landing = new Set<string>();
  /** Standing in near the view: drawn next. */
  const near = new Set<string>();
  let movedAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nearing: IntersectionObserver | null = null;
  let sizing: ResizeObserver | null = null;
  let view = () => innerHeight;
  /** Blocks drawn since the last frame, to be skippable once laid out. */
  const settling = new Set<HTMLElement>();
  let settle = 0;

  /**
   * Each block just drawn, once laid out, can be skipped: by itself, or,
   * in a group, the group as one once its blocks are all drawn. One box
   * skipped is one the browser need not track.
   */
  const skipNow = () => {
    settle = 0;
    const skip = new Map<HTMLElement, number>();
    for (const block of settling) {
      const group = block.parentElement?.closest<HTMLElement>('[data-blocks]');
      const box = group ?? block;
      if (!box.isConnected || box.style.contentVisibility === 'auto') continue;
      if (group?.querySelector('[data-block][aria-hidden]')) continue;
      const height = box.getBoundingClientRect().height;
      if (height > 0) skip.set(box, height);
    }
    settling.clear();
    for (const [box, height] of skip) skippable(box, height);
  };

  const isDrawn = (id: string) => drawn.has(id) || !told.has(id);
  const heightOf = (block: Planned) => heights.get(block.id) ?? block.guess;

  const draw = (ids: ReadonlyArray<string>) => {
    const now: Array<() => void> = [];
    for (const id of ids) {
      near.delete(id);
      if (isDrawn(id)) continue;
      drawn.add(id);
      const element = elements.get(id);
      if (element) nearing?.unobserve(element);
      const set = draws.get(id);
      if (set === undefined) continue;
      landing.add(id);
      now.push(set);
    }
    // As a Transition, so whatever the reader does goes first.
    startTransition(() => now.forEach((set) => set()));
  };

  /** What to draw next: what stands in near the view, else a view's worth from the bottom up. */
  const next = (): ReadonlyArray<string> => {
    for (const id of near) if (isDrawn(id)) near.delete(id);
    if (near.size > 0) return [...near];
    const ids: string[] = [];
    let height = 0;
    for (let at = (order?.length ?? 0) - 1; at >= 0 && height < view(); at--) {
      const block = order![at]!;
      if (isDrawn(block.id)) continue;
      ids.push(block.id);
      height += heightOf(block);
    }
    return ids;
  };

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(step, ms);
  };
  const step = () => {
    // The last batch calls again once it has landed.
    if (landing.size > 0) return;
    const still = performance.now() - movedAt;
    if (still < STILL) return later(STILL - still);
    const ids = next();
    if (ids.length === 0) return;
    draw(ids);
    if (landing.size === 0) later(0);
  };

  const blocks: Blocks = {
    anchor,
    planned: () => order !== null,
    plan: (list) => {
      if (order !== null) return;
      order = list();
      for (const { id } of order) told.add(id);
      const { anchor } = blocks;
      const at =
        anchor.at === 'block'
          ? order.findIndex(({ id }) => id === anchor.id)
          : -1;
      const from = at === -1 ? order.length : at;
      let below = 0;
      for (let each = from; each < order.length && below < view() * 2; each++) {
        drawn.add(order[each]!.id);
        below += heightOf(order[each]!);
      }
      let above = 0;
      const room = view() * (at === -1 ? 3 : 2);
      for (let each = from - 1; each >= 0 && above < room; each--) {
        drawn.add(order[each]!.id);
        above += heightOf(order[each]!);
      }
    },
    isDrawn,
    heightOf: (id) => heights.get(id),
    elementOf: (id) => elements.get(id),
    register: (id, element, set) => {
      elements.set(id, element);
      draws.set(id, set);
      if (!isDrawn(id)) nearing?.observe(element);
      sizing?.observe(element);
      return () => {
        if (elements.get(id) === element) {
          elements.delete(id);
          draws.delete(id);
        }
        nearing?.unobserve(element);
        sizing?.unobserve(element);
      };
    },
    landed: (id) => {
      const element = elements.get(id);
      if (element) {
        settling.add(element);
        settle ||= requestAnimationFrame(skipNow);
      }
      if (landing.delete(id) && landing.size === 0) later(0);
    },
    moved: () => {
      movedAt = performance.now();
    },
    drawTop: () => {
      if (order === null) return;
      const ids: string[] = [];
      let height = 0;
      for (const block of order) {
        if (height >= view() * 3) break;
        height += heightOf(block);
        if (isDrawn(block.id)) continue;
        drawn.add(block.id);
        ids.push(block.id);
      }
      flushSync(() => ids.forEach((id) => draws.get(id)?.()));
    },
    connect: (scroller, content, changed) => {
      view = () => scroller.clientHeight || innerHeight;
      if (typeof IntersectionObserver !== 'undefined')
        nearing = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const id = (entry.target as HTMLElement).dataset.block;
              if (entry.isIntersecting && id !== undefined && !isDrawn(id))
                near.add(id);
            }
            if (near.size > 0 && landing.size === 0) later(0);
          },
          { root: scroller, rootMargin: NEAR_VIEW },
        );
      if (typeof ResizeObserver !== 'undefined')
        sizing = new ResizeObserver((entries) => {
          changed();
          for (const entry of entries) {
            const block = entry.target as HTMLElement;
            const id = block.dataset.block;
            if (id === undefined || block.hasAttribute('aria-hidden')) continue;
            const height =
              entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            if (height > 0) remember(id, height);
          }
        });
      for (const [id, element] of elements) {
        if (!isDrawn(id)) nearing?.observe(element);
        sizing?.observe(element);
      }
      sizing?.observe(content);
      sizing?.observe(scroller);
      later(0);
      return () => {
        nearing?.disconnect();
        sizing?.disconnect();
        nearing = null;
        sizing = null;
        clearTimeout(timer);
        cancelAnimationFrame(settle);
        settle = 0;
      };
    },
  };
  return blocks;
};
