import { type RefObject, useEffect, useRef } from 'react';

/*
 * Focus inside a layer: only once it is on screen, and never taken from a
 * tap outside but given back first. iOS raises its keyboard only for focus
 * given in a tap, and a layer is on screen only after it: the tap that
 * opens one gives focus to a stand-in field instead, which keeps the
 * keyboard up until the layer's own field takes focus from it.
 */

const isField = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement &&
  (element.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));

const fieldIn = (layer: Element | null) => {
  const focused = document.activeElement;
  return layer !== null && isField(focused) && layer.contains(focused)
    ? focused
    : null;
};

/**
 * Whether a field inside `layer` had focus as the last press began: a tap
 * outside can take focus from it before the layer hears of the tap. Ask
 * `blurred()` then: it takes focus from that field, if it still has it,
 * and says whether there was one.
 */
export const useFieldAtPress = (layer: RefObject<HTMLElement | null>) => {
  const had = useRef(false);
  useEffect(() => {
    const press = () => {
      had.current = fieldIn(layer.current) !== null;
    };
    document.addEventListener('pointerdown', press, true);
    return () => document.removeEventListener('pointerdown', press, true);
  }, [layer]);
  return {
    blurred: () => {
      const field = fieldIn(layer.current);
      field?.blur();
      const was = had.current || field !== null;
      had.current = false;
      return was;
    },
  };
};

/** How long the stand-in waits for a field to take focus from it, in ms. */
const STAND_IN_FOR = 1000;

// The stand-in field holding the keyboard up, while there is one.
let standIn: HTMLInputElement | null = null;

const letGo = () => {
  standIn?.remove();
  standIn = null;
};

/**
 * Raises the on-screen keyboard, called in the tap that opens a layer
 * whose field takes focus once it is on screen: a stand-in field out of
 * sight takes focus now, and gives it to that field then. Unless one takes
 * it soon, the stand-in lets go and the keyboard goes down.
 */
export const raiseKeyboard = () => {
  letGo();
  const field = document.createElement('input');
  field.setAttribute('aria-hidden', 'true');
  field.tabIndex = -1;
  // 16px, so iOS does not zoom; out of sight, and in nobody's way.
  field.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none';
  document.body.append(field);
  field.focus({ preventScroll: true });
  standIn = field;
  field.addEventListener('blur', () => standIn === field && letGo(), {
    once: true,
  });
  setTimeout(() => standIn === field && letGo(), STAND_IN_FOR);
};

/**
 * Focuses the element marked `data-autofocus` in `layer` a frame after it
 * is first drawn, taking focus from a stand-in that holds the keyboard up:
 * iOS moves a layer still settling when a field inside it takes focus.
 */
export const useFocusOnOpen = (layer: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    let drawn = 0;
    const painted = requestAnimationFrame(() => {
      drawn = requestAnimationFrame(() => {
        layer.current
          ?.querySelector<HTMLElement>('[data-autofocus]')
          ?.focus({ preventScroll: true });
        letGo();
      });
    });
    return () => {
      cancelAnimationFrame(painted);
      cancelAnimationFrame(drawn);
    };
  }, [layer]);
};
