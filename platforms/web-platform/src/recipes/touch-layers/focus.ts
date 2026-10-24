import { type RefObject, useEffect, useRef } from 'react';

/*
 * Focus inside a layer: only once it is on screen, and never taken from a
 * tap outside but given back first.
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

/**
 * Focuses the element marked `data-autofocus` in `layer` a frame after it
 * is first drawn: iOS moves a layer still settling when a field inside it
 * takes focus.
 */
export const useFocusOnOpen = (layer: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    let drawn = 0;
    const painted = requestAnimationFrame(() => {
      drawn = requestAnimationFrame(() =>
        layer.current
          ?.querySelector<HTMLElement>('[data-autofocus]')
          ?.focus({ preventScroll: true }),
      );
    });
    return () => {
      cancelAnimationFrame(painted);
      cancelAnimationFrame(drawn);
    };
  }, [layer]);
};
