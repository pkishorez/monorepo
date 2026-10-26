import { type FocusEvent, type RefObject, useState } from 'react';
import { isField } from './focus.ts';

/*
 * Whether a Drawer is Settled: it has risen and holds a field, there as it
 * rose or focused since. A Settled Drawer is moved and sized by the page at
 * once, never by its transition: on iOS the keyboard rising or falling, and
 * the page scrolled to show the field, change the part of the page left
 * visible step by step, and a transition chasing each step fights the
 * keyboard's own. Only a swipe, and closing, still move it.
 */

export const useSettled = (
  popup: RefObject<HTMLElement | null>,
): {
  readonly settled: boolean;
  readonly onOpenChangeComplete: (open: boolean) => void;
  readonly onFocus: (event: FocusEvent) => void;
} => {
  const [risen, setRisen] = useState(false);
  const [field, setField] = useState(false);
  return {
    settled: risen && field,
    onOpenChangeComplete: (open) => {
      setRisen(open);
      setField(open && popup.current?.querySelector('input, textarea') != null);
    },
    onFocus: (event) => {
      if (isField(event.target)) setField(true);
    },
  };
};
