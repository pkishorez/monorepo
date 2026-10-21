/*
 * The pointer, for the field to lean away from: where it is on screen, in
 * CSS pixels, and how present it is. A mouse is present while
 * it is over the page; a touch only for a moment after it lands or moves.
 */

export type Pointer = {
  readonly x: number;
  readonly y: number;
  /** 1 while it is here, falling to 0 when it leaves. */
  readonly target: () => number;
  readonly dispose: () => void;
};

export function trackPointer(): Pointer {
  const state = { x: 0, y: 0, here: false, touchedAt: -Infinity };
  const at = (e: PointerEvent) => {
    state.x = e.clientX;
    state.y = e.clientY;
    if (e.pointerType === 'mouse') state.here = true;
    else state.touchedAt = performance.now();
  };
  const leave = () => {
    state.here = false;
  };
  const options = { passive: true } as const;
  window.addEventListener('pointermove', at, options);
  window.addEventListener('pointerdown', at, options);
  document.documentElement.addEventListener('pointerleave', leave, options);
  window.addEventListener('blur', leave);
  return {
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    target: () =>
      state.here || performance.now() - state.touchedAt < 450 ? 1 : 0,
    dispose() {
      window.removeEventListener('pointermove', at);
      window.removeEventListener('pointerdown', at);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
    },
  };
}
