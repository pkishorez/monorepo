import type { PointerEvent } from 'react';

/**
 * Follow one pointer from the press on `event` until it lets go: `onMove`
 * gets how far it has gone along the axis since the press, and `onEnd` whether
 * it went anywhere at all, so a press that does not move can be a tap.
 */
export const drag = (
  event: PointerEvent<HTMLElement>,
  axis: 'x' | 'y',
  onMove: (by: number) => void,
  onEnd?: (moved: boolean) => void,
) => {
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  const at = (pointer: { clientX: number; clientY: number }) =>
    axis === 'x' ? pointer.clientX : pointer.clientY;
  const start = at(event);
  let moved = false;
  const move = (next: globalThis.PointerEvent) => {
    const by = at(next) - start;
    if (Math.abs(by) > 4) moved = true;
    onMove(by);
  };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    onEnd?.(moved);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
};
