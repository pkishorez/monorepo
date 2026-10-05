import { useEffect, useRef } from 'react';
import { keys, type Surface } from '../../commands/index.ts';

/**
 * Makes a Place's Surface the one the keys go to while it is shown. Sheets
 * open over it, and close back to it.
 */
export const usePlace = (surface: NonNullable<Surface>) => {
  const { setSurface } = keys.useSurface();
  // setSurface changes with every Surface; only a new Place moves the keys.
  const set = useRef(setSurface);
  set.current = setSurface;
  useEffect(() => set.current(surface), [surface]);
};

/** Keeps the element marked with `[data-marked]` in `root` in view. */
export const scrollMarked = (root: HTMLElement) =>
  root
    .querySelector('[data-marked]')
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
