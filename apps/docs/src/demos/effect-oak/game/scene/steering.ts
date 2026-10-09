import { useEffect } from 'react';
import type { PointerEvent } from 'react';

type Toward = 'left' | 'right';
type Steered = { readonly _tag: 'Steered'; readonly toward: Toward };

const KEYS: Readonly<Record<string, Toward>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * ← and → anywhere on the page send Steered, and so does a tap or click on
 * the left or right half of the element given `onPointerDown`. A key something
 * else already handled (the timeline) is left alone; a held key steers once.
 */
export const useSteering = (send: (message: Steered) => void) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const toward = KEYS[event.key];
      if (!toward || event.defaultPrevented || event.repeat) return;
      event.preventDefault();
      send({ _tag: 'Steered', toward });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [send]);

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const { left, width } = event.currentTarget.getBoundingClientRect();
      send({
        _tag: 'Steered',
        toward: event.clientX < left + width / 2 ? 'left' : 'right',
      });
    },
  };
};
