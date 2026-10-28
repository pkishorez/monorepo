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
 * What the on-screen keyboard leaves the sheet, on iOS, which draws it
 * over the page: how much of its foot it hides, and how tall it may be
 * from there to the top of what can be seen, or `null` while nothing is
 * hidden. A field focused is then brought into view. Android resizes the
 * page itself, and hides nothing.
 *
 * Measured in the page's own coordinates, from the sheet's box: iOS
 * scrolls the page under the keyboard and, from iOS 26, shrinks
 * `innerHeight` with it, so the layout viewport's height says nothing of
 * where the sheet's foot is. The box, not the sheet, which slides and
 * follows a swipe.
 */
export type Keyboard = {
  readonly covered: number;
  readonly room: number | null;
};

const NONE: Keyboard = { covered: 0, room: null };

/** Room left over the sheet, as the box's `pt-3` leaves it. */
const TOP_GAP = 12;

export function keyboardOver(
  box: { readonly top: number; readonly bottom: number },
  viewport: Pick<VisualViewport, 'pageTop' | 'height'>,
  scrollY: number,
): Keyboard {
  const top = viewport.pageTop - scrollY;
  const covered = Math.max(0, Math.round(box.bottom - top - viewport.height));
  return {
    covered,
    room:
      covered === 0
        ? null
        : Math.round(box.bottom - Math.max(box.top, top) - TOP_GAP),
  };
}

export function useKeyboard(
  on: boolean,
  root: RefObject<HTMLElement | null>,
): Keyboard {
  const [keyboard, setKeyboard] = useState<Keyboard>(NONE);
  useEffect(() => {
    const viewport = window.visualViewport ?? null;
    if (!on || viewport === null) return;
    const update = () => {
      const box = root.current?.parentElement ?? null;
      const next =
        box === null
          ? NONE
          : keyboardOver(box.getBoundingClientRect(), viewport, window.scrollY);
      setKeyboard((was) =>
        was.covered === next.covered && was.room === next.room ? was : next,
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
  return keyboard;
}
