// oxlint-disable-next-line no-restricted-imports -- keys anywhere on the page are a window listener, kept in the View so a View of the past sends nothing.
import { useEffect } from 'react';
import type { PointerEvent } from 'react';

type Toward = 'left' | 'right';
type Steered = { readonly _tag: 'Steered'; readonly toward: Toward };

/**
 * Keys anywhere on the page, each calling its function: `{ p: pause }`. A key
 * something else already handled (the timeline) is left alone; a held key
 * counts once.
 */
export const useKeys = (keys: Readonly<Record<string, () => void>>) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const pressed =
        keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!pressed || event.defaultPrevented || event.repeat) return;
      event.preventDefault();
      pressed();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keys]);
};

/** ← and → steer, and so does a tap on the left or right half of the element given the result. */
export const useSteering = (
  send: (message: Steered) => void,
  more: Readonly<Record<string, () => void>> = {},
) => {
  useKeys({
    ArrowLeft: () => send({ _tag: 'Steered', toward: 'left' }),
    ArrowRight: () => send({ _tag: 'Steered', toward: 'right' }),
    ...more,
  });
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
