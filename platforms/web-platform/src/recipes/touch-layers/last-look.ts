import { useLayoutEffect, useRef } from 'react';

/*
 * What a layer drew last while it was open. Its owner may drop what is in
 * it as it closes, before it has slid away: the layer keeps showing this,
 * inert, until it is gone.
 */

export const useLastLook = (open: boolean) => {
  const live = useRef<HTMLDivElement>(null);
  const look = useRef('');
  useLayoutEffect(() => {
    if (open && live.current !== null) look.current = live.current.innerHTML;
  });
  return { live, look: look.current };
};
