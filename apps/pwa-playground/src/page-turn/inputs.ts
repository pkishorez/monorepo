import { useEffect } from 'react';
import type { Side } from './geometry.ts';

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'input, textarea, select, [contenteditable="true"], [role="slider"], [role="tablist"], [data-stage]',
  ) !== null;

/**
 * The arrow keys: → toward the next page, ← toward the previous one, unless
 * a modifier is held or focus is somewhere that uses the arrows itself.
 */
export function useTurnKeys(turn: (side: Side) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        editable(event.target)
      ) {
        return;
      }
      const side =
        event.key === 'ArrowRight'
          ? 'next'
          : event.key === 'ArrowLeft'
            ? 'prev'
            : undefined;
      if (side === undefined) return;
      event.preventDefault();
      turn(side);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);
}
