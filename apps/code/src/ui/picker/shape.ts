import { createContext, use } from 'react';
import type { How } from './actor.ts';

/*
 * The shape a Picker is drawn in: as the input that opened it asks,
 * whatever the device or the width of the screen. Opened by keys, a
 * centred list; by a mouse, a popover by its trigger; by a touch, its
 * Picker Mode, as whoever opens it chose: a Drawer or a Dialog.
 */

/** A Picker Mode: how a Picker is drawn when opened by touch. */
export type Mode = 'drawer' | 'dialog';

export type Shape = 'list' | 'popover' | Mode;

/** Asked to open or close, and why, as Base UI says. */
export type Change = (
  open: boolean,
  details: {
    readonly reason: string;
    /** What asked, such as the click on its trigger. */
    readonly event?: Event;
    readonly cancel: () => void;
    readonly allowPropagation: () => void;
  },
) => void;

export const shapeOf = (
  how: typeof How.Type | null,
  mode: Mode,
): Shape | null =>
  how === null
    ? null
    : how === 'keys'
      ? 'list'
      : how === 'mouse'
        ? 'popover'
        : mode;

/**
 * How a pointer that opened a Picker asks it to be drawn: a pen as a
 * finger. A click with no pointer, as a key pressing a button makes, is
 * read from the input last used (`data-input`), and is a mouse's unless a
 * touch was last: iOS clicks carry no pointer.
 */
export const howOf = (event: Event | undefined): 'mouse' | 'touch' => {
  const type =
    event !== undefined && 'pointerType' in event
      ? (event as PointerEvent).pointerType
      : '';
  if (type === 'mouse') return 'mouse';
  if (type === 'touch' || type === 'pen') return 'touch';
  return typeof document !== 'undefined' &&
    document.documentElement.dataset.input === 'touch'
    ? 'touch'
    : 'mouse';
};

/**
 * What the List needs of its Frame: the shape, what the Picker is called,
 * and whether its search takes focus in a Dialog opened by touch.
 */
const Drawn = createContext<{
  readonly shape: Shape;
  readonly label: string;
  readonly focusOnTouch: boolean;
}>({ shape: 'list', label: '', focusOnTouch: false });

export const DrawnIn = Drawn.Provider;

export const useDrawn = () => use(Drawn);
