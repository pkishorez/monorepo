import { createContext, use } from 'react';
import type { How } from '../actor.ts';

/*
 * The shape a Picker is drawn in: as the input that opened it asks,
 * whatever the width of the screen. Opened by keys, a centred list; by a
 * mouse, a popover by its trigger; by a touch, its Picker Mode, as
 * whoever opens it chose: a Drawer, or a Sheet, a tall Drawer with a search. A click on its trigger
 * on a device with no keyboard and no mouse is a touch, whatever it said.
 */

/** A Picker Mode: how a Picker is drawn when opened by touch. */
export type Mode = 'drawer' | 'sheet';

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
 * The input last used, as the page keeps it (`data-input`): a touch, the
 * keys, or else a mouse.
 */
const lastInput = (): typeof How.Type => {
  const input =
    typeof document === 'undefined'
      ? undefined
      : document.documentElement.dataset['input'];
  return input === 'touch' ? 'touch' : input === 'keys' ? 'keys' : 'mouse';
};

/**
 * How the click that opened a Picker asks it to be drawn: on a device
 * with no keyboard and no mouse, `touchOnly`, a touch; else by its
 * pointer, a pen as a finger. A click with no pointer, as Enter or Space
 * on a focused button makes, or a tap in iOS, whose clicks carry none, is
 * read from the input last used: the keys, a touch, or else a mouse.
 */
export const howOf = (
  event: Event | undefined,
  touchOnly = false,
): typeof How.Type => {
  if (touchOnly) return 'touch';
  const type =
    event !== undefined && 'pointerType' in event
      ? (event as PointerEvent).pointerType
      : '';
  if (type === 'mouse') return 'mouse';
  if (type === 'touch' || type === 'pen') return 'touch';
  return lastInput();
};

/**
 * How something typed opens a Picker, such as a `/` in the Composer: a
 * touch while the input last used was one, as an on-screen keyboard
 * types, else the keys.
 */
export const howTyped = (): 'keys' | 'touch' =>
  lastInput() === 'touch' ? 'touch' : 'keys';

/**
 * What the List needs of its Frame: the shape, what the Picker is called,
 * and whether its owner holds it, under something it shows.
 */
const Drawn = createContext<{
  readonly shape: Shape;
  readonly label: string;
  readonly held: boolean;
}>({ shape: 'list', label: '', held: false });

export const DrawnIn = Drawn.Provider;

export const useDrawn = () => use(Drawn);
