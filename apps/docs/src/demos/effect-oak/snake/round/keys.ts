// oxlint-disable-next-line no-restricted-imports -- keys anywhere on the page are a window listener, kept in the View so a View of the past sends nothing.
import { useEffect } from 'react';
import type { Direction } from './body.js';

type Pressed =
  | { readonly _tag: 'Turned'; readonly direction: Direction }
  | { readonly _tag: 'PressedStart' }
  | { readonly _tag: 'PressedPause' }
  | { readonly _tag: 'PressedRestart' };

const TURNS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  w: 'Up',
  s: 'Down',
  a: 'Left',
  d: 'Right',
};

const toMessage = (key: string): Pressed | null => {
  const direction = TURNS[key];
  if (direction) return { _tag: 'Turned', direction };
  if (key === 'Enter') return { _tag: 'PressedStart' };
  if (key === 'p') return { _tag: 'PressedPause' };
  if (key === 'r') return { _tag: 'PressedRestart' };
  return null;
};

/**
 * The game's keys anywhere on the page, as Messages. Space is left to the
 * Shell, which uses it to switch Live and Replay: Enter starts, P pauses.
 */
export const useKeys = (send: (message: Pressed) => void) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const message = toMessage(
        event.key.length === 1 ? event.key.toLowerCase() : event.key,
      );
      if (!message) return;
      event.preventDefault();
      send(message);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [send]);
};
