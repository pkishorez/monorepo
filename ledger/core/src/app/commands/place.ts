import { useEffect, useRef } from 'react';
import { keys, type Surface } from './keys.ts';

/**
 * Makes a Place's Surface the one Commands go to while it is shown. Sheets
 * open over it, and close back to it.
 */
export const usePlace = (surface: NonNullable<Surface>) => {
  const { setSurface } = keys.useSurface();
  // setSurface changes with every Surface; only a new Place moves the keys.
  const set = useRef(setSurface);
  set.current = setSurface;
  useEffect(() => set.current(surface), [surface]);
};
