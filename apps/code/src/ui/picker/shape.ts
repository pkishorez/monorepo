import { createContext, use } from 'react';
import type { How } from './actor.ts';

/*
 * The shape a Picker is drawn in. With a keyboard, how it was opened
 * decides: a centred list by keys, a popover by pointer. With none, its
 * Picker Mode does, as whoever opens it chose: a Drawer or a Dialog. The
 * width of the screen never does.
 */

/** A Picker Mode: how a Picker is drawn on a device with no keyboard. */
export type Mode = 'drawer' | 'dialog';

export type Shape = 'list' | 'popover' | Mode;

/** Asked to open or close, and why, as Base UI says. */
export type Change = (
  open: boolean,
  details: {
    readonly reason: string;
    readonly cancel: () => void;
    readonly allowPropagation: () => void;
  },
) => void;

export const shapeOf = (
  how: typeof How.Type | null,
  keyboard: boolean,
  mode: Mode,
): Shape | null => {
  if (how === null) return null;
  if (!keyboard) return mode;
  return how === 'keys' ? 'list' : 'popover';
};

/**
 * What the List needs of its Frame: the shape, what the Picker is called,
 * and whether its search takes focus in a Dialog.
 */
const Drawn = createContext<{
  readonly shape: Shape;
  readonly label: string;
  readonly focusOnTouch: boolean;
}>({ shape: 'list', label: '', focusOnTouch: false });

export const DrawnIn = Drawn.Provider;

export const useDrawn = () => use(Drawn);
