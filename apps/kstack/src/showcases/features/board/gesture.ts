import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { animate, useMotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Boards } from './boards.ts';
import { SWIPE_COMMIT } from './card.tsx';
import type { ColumnId } from './data.ts';
import { GAP, type Pager } from './pager.ts';

// The left edge strip belongs to the sidebar.
const EDGE = 24;
// Px a finger moves before its direction decides what it does.
const LOCK = 10;
// Ms a finger holds still on a card to lift it.
const HOLD = 400;
// Px from the board's side, and ms held there, to page while carrying a card.
const AUTO_EDGE = 40;
const AUTO_DWELL = 450;
// Px/s that moves a card however short the swipe.
const FLICK = 600;

const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

type Run = {
  mode: 'pending' | 'page' | 'card' | 'lifted' | 'none';
  readonly pointer: Pointer;
  readonly card: HTMLElement | undefined;
  readonly off: Array<() => void>;
  hold?: ReturnType<typeof setTimeout>;
  auto?: ReturnType<typeof setTimeout>;
  autoWay: number;
  // The track's x, or the lifted card's corner less the finger's move, as fingers took it.
  base: { x: number; y: number };
  page: number;
};

/**
 * Every touch on the board, decided by where it lands and which way it first
 * moves: sideways on a card swipes it to the next or previous column,
 * sideways elsewhere pages the board, and still on a card for HOLD ms lifts
 * it to carry anywhere. Up and down stays with the column's own scroll.
 */
export function useBoardGesture(props: {
  readonly boards: Boards;
  readonly pager: Pager;
}) {
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const run = useRef<Run | undefined>(undefined);

  const swipeX = useMotionValue(0);
  const [swiping, setSwiping] = useState<string>();
  const settling = useRef<(() => void) | undefined>(undefined);
  const [lifted, setLifted] = useState<{ id: string; width: number }>();
  const overlay = {
    x: useMotionValue(0),
    y: useMotionValue(0),
    scale: useMotionValue(1),
  };
  // Whether this Gesture lifted a card: a pull it also makes must not refresh.
  const carrying = useMotionValue(false);

  const idOf = (r: Run) => r.card?.dataset.card ?? '';

  // Where the lifted card would land under the finger: the nearest column,
  // after every card whose middle is above the finger.
  const retarget = (r: Run) => {
    const zone = latest.current.pager.ref.current;
    if (zone === null) return;
    const px = r.pointer.x.get();
    const py = r.pointer.y.get();
    let best: HTMLElement | undefined;
    let distance = Infinity;
    for (const column of zone.querySelectorAll<HTMLElement>('[data-column]')) {
      const rect = column.getBoundingClientRect();
      const d = Math.max(rect.left - px, px - rect.right, 0);
      if (d < distance) [best, distance] = [column, d];
    }
    if (best === undefined) return;
    const id = idOf(r);
    const index = [...best.querySelectorAll<HTMLElement>('[data-card]')].filter(
      (card) => {
        if (card.dataset.card === id) return false;
        const rect = card.getBoundingClientRect();
        return rect.top + rect.height / 2 < py;
      },
    ).length;
    latest.current.boards.place(id, best.dataset.column as ColumnId, index);
  };

  // Carried to a side of the board and held there, the board pages.
  const autoPage = (r: Run) => {
    const zone = latest.current.pager.ref.current;
    if (zone === null) return;
    const rect = zone.getBoundingClientRect();
    const px = r.pointer.x.get();
    const way =
      px > rect.right - AUTO_EDGE ? 1 : px < rect.left + AUTO_EDGE ? -1 : 0;
    if (way !== r.autoWay) {
      clearTimeout(r.auto);
      r.auto = undefined;
      r.autoWay = way;
    }
    if (way === 0 || r.auto !== undefined) return;
    r.auto = setTimeout(() => {
      r.auto = undefined;
      const { pager } = latest.current;
      pager.goTo(pager.current() + way, 0, () => {
        if (r.mode !== 'lifted') return;
        retarget(r);
        autoPage(r);
      });
    }, AUTO_DWELL);
  };

  const lift = (r: Run) => {
    if (r.card === undefined) return;
    r.mode = 'lifted';
    const rect = r.card.getBoundingClientRect();
    r.base = {
      x: rect.left - r.pointer.dx.get(),
      y: rect.top - r.pointer.dy.get(),
    };
    overlay.x.set(rect.left);
    overlay.y.set(rect.top);
    animate(overlay.scale, 1.04, SPRING);
    carrying.set(true);
    setLifted({ id: idOf(r), width: rect.width });
    navigator.vibrate?.(10);
  };

  const step = (r: Run) => {
    const dx = r.pointer.dx.get();
    const dy = r.pointer.dy.get();
    const { boards, pager } = latest.current;
    if (r.mode === 'pending') {
      if (Math.hypot(dx, dy) < LOCK) return;
      clearTimeout(r.hold);
      if (Math.abs(dx) <= Math.abs(dy)) {
        r.mode = 'none';
        return;
      }
      if (r.card === undefined) {
        r.mode = 'page';
        r.base = { x: pager.grab(), y: 0 };
        r.page = pager.current();
      } else {
        r.mode = 'card';
        // A card still flying lands now: one swipe at a time.
        settling.current?.();
        swipeX.stop();
        swipeX.set(0);
        setSwiping(idOf(r));
      }
    }
    if (r.mode === 'page') pager.drag(r.base.x + dx);
    if (r.mode === 'card') {
      const to = boards.neighbour(idOf(r), dx > 0 ? 1 : -1);
      swipeX.set(to === undefined ? dx * 0.2 : dx);
    }
    if (r.mode === 'lifted') {
      overlay.x.set(r.base.x + dx);
      overlay.y.set(r.base.y + dy);
      retarget(r);
      autoPage(r);
    }
  };

  const release = (r: Run, interrupted: boolean) => {
    const { boards, pager } = latest.current;
    const dx = r.pointer.dx.get();
    const velocity = interrupted ? 0 : r.pointer.dx.getVelocity();
    if (r.mode === 'page') pager.release(r.page, velocity);
    if (r.mode === 'card') {
      const id = idOf(r);
      const way = dx > 0 ? 1 : -1;
      const to = boards.neighbour(id, way);
      const moves =
        !interrupted &&
        to !== undefined &&
        velocity * way > -FLICK / 2 &&
        (Math.abs(dx) >= SWIPE_COMMIT || velocity * way >= FLICK);
      const settle = () => {
        if (settling.current !== settle) return;
        settling.current = undefined;
        if (moves) boards.place(id, to, 0);
        setSwiping(undefined);
        swipeX.jump(0);
      };
      settling.current = settle;
      animate(swipeX, moves ? way * (pager.column + GAP) : 0, {
        ...SPRING,
        velocity,
        onComplete: settle,
      });
    }
    if (r.mode === 'lifted') {
      const slot = pager.ref.current?.querySelector(`[data-card="${idOf(r)}"]`);
      const rect = slot?.getBoundingClientRect();
      if (rect !== undefined) {
        animate(overlay.x, rect.left, SPRING);
        animate(overlay.y, rect.top, SPRING);
      }
      animate(overlay.scale, 1, {
        ...SPRING,
        onComplete: () => setLifted(undefined),
      });
    }
  };

  useGesture({
    // Sideways turns the page or slides a card; up and down is the columns'.
    directions: ['left', 'right'],
    // A lifted card keeps the touch, even over a column that could scroll.
    captures: () => run.current?.mode === 'lifted',
    onStart: (pointers) => {
      const [pointer] = pointers.values();
      if (pointer === undefined) return;
      carrying.set(false);
      const card =
        pointer.target?.closest<HTMLElement>('[data-card]') ?? undefined;
      const r: Run = {
        mode: pointer.start.x <= EDGE ? 'none' : 'pending',
        pointer,
        card,
        off: [],
        autoWay: 0,
        base: { x: 0, y: 0 },
        page: 0,
      };
      run.current = r;
      if (r.mode === 'none') return;
      if (card !== undefined) r.hold = setTimeout(() => lift(r), HOLD);
      r.off.push(
        pointer.dx.on('change', () => step(r)),
        pointer.dy.on('change', () => step(r)),
      );
    },
    onPointer: (pointer) => {
      const r = run.current;
      // A second finger makes it something else.
      if (r?.mode === 'pending' && pointer !== r.pointer) {
        clearTimeout(r.hold);
        r.mode = 'none';
      }
    },
    onEnd: (_pointers, { interrupted, preventClick }) => {
      const r = run.current;
      if (r === undefined) return;
      run.current = undefined;
      clearTimeout(r.hold);
      clearTimeout(r.auto);
      for (const off of r.off) off();
      if (r.mode === 'page' || r.mode === 'card' || r.mode === 'lifted') {
        preventClick();
      }
      release(r, interrupted);
    },
  });

  // Workaround: the zone decides who owns a touch at its first movement, a
  // column's scroll or whoever wants its Direction, and a finger held on a
  // card still trembles a px or two. Those first few px are kept from the
  // zone while a hold may lift, so it decides on a real movement, or on the
  // lifted card.
  useEffect(() => {
    const zone = latest.current.pager.ref.current;
    if (zone === null) return;
    const hide = (event: TouchEvent) => {
      const r = run.current;
      const [touch] = event.touches;
      if (
        r?.mode !== 'pending' ||
        r.hold === undefined ||
        touch === undefined
      ) {
        return;
      }
      const moved = Math.hypot(
        touch.clientX - r.pointer.start.x,
        touch.clientY - r.pointer.start.y,
      );
      if (event.touches.length === 1 && moved < LOCK) event.stopPropagation();
    };
    zone.addEventListener('touchmove', hide, { capture: true, passive: true });
    return () => zone.removeEventListener('touchmove', hide, { capture: true });
  }, []);

  return {
    swipe: { id: swiping, x: swipeX },
    lifted,
    overlay,
    carrying,
  };
}

export type BoardGesture = ReturnType<typeof useBoardGesture>;
