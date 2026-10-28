import {
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

/*
 * The dialog as a sheet, on a device with no keyboard: a swipe down its
 * head minimises it, and its foot stays over the on-screen keyboard.
 */

/**
 * A swipe down the sheet's head: the sheet follows the finger, and
 * minimises once pulled far or fast enough, else settles back.
 */

export function useSwipeDown(
  sheet: RefObject<HTMLElement | null>,
  on: boolean,
  onMinimise: () => void,
) {
  const start = useRef<{ y: number; at: number; id: number } | null>(null);
  const moved = (y: number) => {
    const element = sheet.current;
    if (element === null || element === undefined) return;
    element.style.transition = 'none';
    element.style.translate = `0 ${Math.max(0, y)}px`;
  };
  const settle = () => {
    const element = sheet.current;
    if (element === null || element === undefined) return;
    element.style.transition = '';
    element.style.translate = '';
  };
  if (!on) return {};
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if ((event.target as Element).closest('button') !== null) return;
      start.current = {
        y: event.clientY,
        at: performance.now(),
        id: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent) => {
      if (start.current?.id !== event.pointerId) return;
      moved(event.clientY - start.current.y);
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (from?.id !== event.pointerId) return;
      const pulled = event.clientY - from.y;
      const speed = pulled / Math.max(1, performance.now() - from.at);
      settle();
      if (pulled > 72 || (pulled > 16 && speed > 0.5)) onMinimise();
    },
    onPointerCancel: () => {
      start.current = null;
      settle();
    },
  };
}

/**
 * How much of the page's foot the on-screen keyboard hides, on iOS, which
 * draws it over the page; a field focused is then brought into view.
 * Android resizes the page itself, and hides nothing.
 */
export function useCoveredBottom(
  on: boolean,
  root: RefObject<HTMLElement | null>,
) {
  const [covered, setCovered] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport ?? null;
    if (!on || viewport === null) return;
    const update = () => {
      setCovered(
        Math.max(
          0,
          Math.round(window.innerHeight - viewport.offsetTop - viewport.height),
        ),
      );
      const now = document.activeElement;
      if (now instanceof HTMLElement && root.current?.contains(now) === true)
        requestAnimationFrame(() => now.scrollIntoView({ block: 'nearest' }));
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [on]);
  return covered;
}
