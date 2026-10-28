import { type CSSProperties, type RefObject, useEffect, useState } from 'react';
import { isField } from './focus.ts';

/*
 * What the on-screen keyboard leaves of the page, for a layer at its top
 * or its foot, and for a box in the page, such as a sheet in a column.
 *
 * A layer fixed to the page is placed in the layout viewport, as tall as
 * `documentElement.clientHeight`; what can be seen is the visual viewport,
 * `offsetTop` down it and `height` tall. The keyboard hides the rest of
 * its foot: `clientHeight - offsetTop - height`. That holds wherever the
 * browser puts the keyboard:
 *
 * - iOS draws it over the page and pans the page up under it, so a field
 *   is seen. From iOS 26 it shrinks `innerHeight` by as much as it pans,
 *   so `innerHeight` says nothing of the layout viewport; `clientHeight`
 *   stays.
 * - Android, with `interactive-widget=resizes-content`, makes the layout
 *   viewport itself shorter: the two are one, and nothing is hidden.
 * - A desktop has no keyboard: the two are one.
 *
 * A box in the page is measured against what can be seen in the page's
 * own coordinates: from `pageTop - scrollY` to `height` below it.
 *
 * The keyboard is up when a field has focus and what can be seen is well
 * short of the tallest the layout viewport has been at this width: on
 * Android it shrinks the layout viewport too. While it is up no room is
 * kept for the home indicator, which it covers.
 */

/** What the page and `window.visualViewport` say. */
export interface Viewport {
  /** The layout viewport's height: `documentElement.clientHeight`. */
  readonly layout: number;
  /** The tallest `layout` has been at this width, keyboard down. */
  readonly tallest: number;
  readonly offsetTop: number;
  readonly pageTop: number;
  readonly height: number;
  readonly scale: number;
  /** Whether a field has focus, so the keyboard may be up. */
  readonly field: boolean;
}

/** What can be seen, for a layer fixed to the page, in its own pixels. */
export interface Visible {
  /** From the layout viewport's top to what can be seen. */
  readonly top: number;
  readonly height: number;
  /** How much of the layout viewport's foot the keyboard hides. */
  readonly bottom: number;
  /** Whether the on-screen keyboard is up. */
  readonly keyboard: boolean;
}

/** Shorter than the tallest by more than this, with a field, is a keyboard. */
const KEYBOARD = 120;

/** Pinch-zoomed in: nothing is said of a keyboard then. */
const zoomed = (viewport: Viewport) => viewport.scale > 1.01;

export const visibleOf = (viewport: Viewport): Visible => {
  const flat = !zoomed(viewport);
  const top = Math.max(0, Math.round(viewport.offsetTop));
  return {
    top,
    height: Math.round(viewport.height),
    bottom: flat
      ? Math.max(
          0,
          Math.round(viewport.layout - viewport.offsetTop - viewport.height),
        )
      : 0,
    keyboard:
      flat && viewport.field && viewport.tallest - viewport.height > KEYBOARD,
  };
};

/** What the keyboard leaves a box in the page. */
export interface Over {
  /** How much of the box's foot is hidden. */
  readonly covered: number;
  /**
   * How tall a layer at the box's foot may be, from that foot to the top
   * of what is seen, `covered` included: with its foot padded by
   * `covered`, all of it above the keyboard is seen. `null` while nothing
   * is hidden.
   */
  readonly room: number | null;
}

/**
 * What the keyboard leaves `box`, a rectangle from `getBoundingClientRect`,
 * with `gap` kept free over it.
 */
export const overBox = (
  box: { readonly top: number; readonly bottom: number },
  viewport: Pick<Viewport, 'pageTop' | 'height' | 'scale'>,
  scrollY: number,
  gap = 0,
): Over => {
  if (viewport.scale > 1.01) return { covered: 0, room: null };
  const top = viewport.pageTop - scrollY;
  const covered = Math.max(0, Math.round(box.bottom - top - viewport.height));
  return {
    covered,
    room:
      covered === 0
        ? null
        : Math.round(box.bottom - Math.max(box.top, top) - gap),
  };
};

// The tallest the layout viewport has been, and at which width.
let tallest = { width: 0, height: 0 };

/** The Viewport now, or `null` where there is no visual viewport, as in jsdom. */
export const readViewport = (): Viewport | null => {
  const viewport = window.visualViewport ?? null;
  if (viewport === null) return null;
  const { clientHeight: layout, clientWidth: width } = document.documentElement;
  const field = isField(document.activeElement);
  if (tallest.width !== width) tallest = { width, height: layout };
  // Only with no field: the keyboard may shrink it.
  else if (!field)
    tallest = { width, height: Math.max(tallest.height, layout) };
  return {
    layout,
    tallest: Math.max(tallest.height, layout),
    offsetTop: viewport.offsetTop,
    pageTop: viewport.pageTop,
    height: viewport.height,
    scale: viewport.scale,
    field,
  };
};

/**
 * Calls `update` whenever what can be seen may have changed: the visual
 * viewport resized or panned, the window resized, or focus moved, which
 * raises or drops the keyboard; then again once that has settled.
 */
const watch = (update: () => void) => {
  const viewport = window.visualViewport ?? null;
  let frame = 0;
  let later: number[] = [];
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const timer of later) clearTimeout(timer);
    later = [];
  };
  const soon = () => {
    stop();
    frame = requestAnimationFrame(update);
    // The keyboard takes a moment to rise or fall, and some browsers say
    // so only at its end, or not at all: read again until it has.
    later = SETTLING.map((ms) => window.setTimeout(update, ms));
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  viewport?.addEventListener('scrollend', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', soon);
  document.addEventListener('focusout', soon);
  return () => {
    stop();
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    viewport?.removeEventListener('scrollend', update);
    window.removeEventListener('resize', update);
    document.removeEventListener('focusin', soon);
    document.removeEventListener('focusout', soon);
  };
};

/** When to read again after focus moves, in ms: over the keyboard's rise. */
const SETTLING = [120, 350, 700, 1200];

/**
 * Scrolls the focused field in `layer`, if there is one, into sight in the
 * nearest part of the layer that scrolls, and nothing outside the layer:
 * the page behind stays where it is.
 */
export const revealField = (layer: HTMLElement | null) => {
  const field = document.activeElement;
  if (layer === null || !isField(field) || !layer.contains(field)) return;
  const MARGIN = 12;
  for (
    let scroller = field.parentElement;
    scroller !== null && layer.contains(scroller);
    scroller = scroller.parentElement
  ) {
    if (scroller.scrollHeight <= scroller.clientHeight + 1) continue;
    if (!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) continue;
    const box = scroller.getBoundingClientRect();
    const at = field.getBoundingClientRect();
    if (at.top < box.top + MARGIN)
      scroller.scrollTop -= box.top + MARGIN - at.top;
    else if (at.bottom > box.bottom - MARGIN)
      scroller.scrollTop += Math.min(
        at.bottom - (box.bottom - MARGIN),
        // A field taller than the room keeps its top in sight.
        at.top - (box.top + MARGIN),
      );
    return;
  }
};

const same = (a: Visible | null, b: Visible | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.height === b.height &&
    a.bottom === b.bottom &&
    a.keyboard === b.keyboard);

/**
 * What can be seen, live while `on`, for a layer fixed to the page; its
 * focused field, in `layer`, is kept in sight as it changes.
 */
export const useVisible = (
  on: boolean,
  layer?: RefObject<HTMLElement | null>,
): Visible | null => {
  const [visible, setVisible] = useState<Visible | null>(null);
  useEffect(() => {
    if (!on) return setVisible(null);
    const update = () => {
      const viewport = readViewport();
      const next = viewport === null ? null : visibleOf(viewport);
      setVisible((was) => (same(was, next) ? was : next));
      if (layer !== undefined)
        requestAnimationFrame(() => revealField(layer.current));
    };
    update();
    return watch(update);
  }, [on]);
  return visible;
};

/**
 * `--visible-top`, `--visible-height`, `--visible-bottom` and
 * `--visible-safe-bottom`, live while `on`, for a layer fixed to the page:
 * at its foot, `bottom: var(--visible-bottom)` sits on the keyboard; at
 * its top, `top: var(--visible-top)` under what the page was panned by;
 * `max-height` from `--visible-height` keeps its head in sight.
 * `--visible-safe-bottom` is the home indicator's room, none while the
 * keyboard covers it. A focused field in `layer` is kept in sight.
 */
export const useVisibleViewport = (
  on: boolean,
  layer?: RefObject<HTMLElement | null>,
): CSSProperties => {
  const visible = useVisible(on, layer);
  return visible === null
    ? {}
    : ({
        '--visible-top': `${visible.top}px`,
        '--visible-height': `${visible.height}px`,
        '--visible-bottom': `${visible.bottom}px`,
        '--visible-safe-bottom': visible.keyboard
          ? '0px'
          : 'env(safe-area-inset-bottom)',
      } as CSSProperties);
};

/** What the keyboard leaves a box, and whether it is up. */
export interface Keyboard extends Over {
  readonly keyboard: boolean;
}

const NONE: Keyboard = { covered: 0, room: null, keyboard: false };

/**
 * What the keyboard leaves `box`, a part of the page that does not move
 * as its layer does, and whether it is up, live while `on`, with `gap` kept free over it; a
 * focused field in `layer` is kept in sight. For a layer placed in the
 * page rather than fixed to it: pad its foot by `covered` and keep it
 * no taller than `room`.
 */
export const useKeyboardOver = (
  on: boolean,
  box: RefObject<HTMLElement | null>,
  layer: RefObject<HTMLElement | null>,
  gap = 0,
): Keyboard => {
  const [over, setOver] = useState<Keyboard>(NONE);
  useEffect(() => {
    if (!on) return setOver(NONE);
    const update = () => {
      const viewport = readViewport();
      const element = box.current;
      const next: Keyboard =
        viewport === null || element === null
          ? NONE
          : {
              ...overBox(
                element.getBoundingClientRect(),
                viewport,
                window.scrollY,
                gap,
              ),
              keyboard: visibleOf(viewport).keyboard,
            };
      setOver((was) =>
        was.covered === next.covered &&
        was.room === next.room &&
        was.keyboard === next.keyboard
          ? was
          : next,
      );
      requestAnimationFrame(() => revealField(layer.current));
    };
    update();
    return watch(update);
  }, [on, gap]);
  return over;
};
