import { useEffect, useRef, type RefObject } from 'react';

const DECELERATION = 0.97;
const MIN_VELOCITY = 0.3;
const MS_PER_FRAME = 16;

export function useTouchScroll(
  overlayRef: RefObject<HTMLElement | null>,
  onDelta: (dy: number) => void,
  enabled: boolean,
) {
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!enabled || !overlay) return;

    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let inertiaId: number | null = null;

    const stopInertia = () => {
      if (inertiaId !== null) {
        cancelAnimationFrame(inertiaId);
        inertiaId = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      stopInertia();
      if (e.touches.length !== 1) return;
      e.preventDefault();
      lastY = e.touches[0].clientY;
      lastTime = performance.now();
      velocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();

      const y = e.touches[0].clientY;
      const now = performance.now();
      const dy = lastY - y;
      const dt = now - lastTime;

      if (dt > 0) velocity = dy / dt;

      onDeltaRef.current(dy);
      lastY = y;
      lastTime = now;
    };

    const onTouchEnd = () => {
      let v = velocity * MS_PER_FRAME;

      const decelerate = () => {
        v *= DECELERATION;
        if (Math.abs(v) < MIN_VELOCITY) {
          inertiaId = null;
          return;
        }
        onDeltaRef.current(v);
        inertiaId = requestAnimationFrame(decelerate);
      };

      if (Math.abs(v) > MIN_VELOCITY) {
        inertiaId = requestAnimationFrame(decelerate);
      }
    };

    overlay.addEventListener('touchstart', onTouchStart, { passive: false });
    overlay.addEventListener('touchmove', onTouchMove, { passive: false });
    overlay.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      stopInertia();
      overlay.removeEventListener('touchstart', onTouchStart);
      overlay.removeEventListener('touchmove', onTouchMove);
      overlay.removeEventListener('touchend', onTouchEnd);
    };
  }, [overlayRef, enabled]);
}
