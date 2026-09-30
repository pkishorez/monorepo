import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { animate, useMotionValue } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Pager } from './pager.ts';

// Both side strips belong to the sidebars.
const EDGE = 24;
// Px a finger moves before its direction decides what it does.
const LOCK = 10;
/** Px a row slides left to save; also where its hint is fully shown. */
export const SAVE_AT = 88;
// Px/s left that saves however short the swipe.
const FLICK = 600;

const SPRING = { type: 'spring', visualDuration: 0.22, bounce: 0 } as const;

type Run = {
  mode: 'pending' | 'page' | 'row' | 'none';
  readonly pointer: Pointer;
  readonly row: string | undefined;
  readonly off: Array<() => void>;
  base: number;
  page: number;
};

/**
 * Every sideways touch on the reader, decided by where it lands and which
 * way it first moves: left on an article slides it to save, right on the
 * first tab is the sidebar's, and anything else sideways turns the tab.
 * Up and down stays with the feed's own scroll.
 */
export function useReaderGesture(props: {
  readonly pager: Pager;
  readonly onSave: (id: string) => void;
}) {
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const run = useRef<Run | undefined>(undefined);
  const rowX = useMotionValue(0);
  const [row, setRow] = useState<string>();

  const step = (r: Run) => {
    const dx = r.pointer.dx.get();
    const dy = r.pointer.dy.get();
    const { pager } = latest.current;
    if (r.mode === 'pending') {
      if (Math.hypot(dx, dy) < LOCK) return;
      if (Math.abs(dx) <= Math.abs(dy)) r.mode = 'none';
      else if (dx < 0 && r.row !== undefined) {
        r.mode = 'row';
        rowX.stop();
        rowX.set(0);
        setRow(r.row);
      } else if (dx > 0 && pager.current() === 0) r.mode = 'none';
      else {
        r.mode = 'page';
        r.base = pager.grab();
        r.page = pager.current();
      }
    }
    if (r.mode === 'page') pager.drag(r.base + dx);
    if (r.mode === 'row') {
      const past = -dx - SAVE_AT * 1.5;
      rowX.set(past > 0 ? -(SAVE_AT * 1.5 + past * 0.3) : Math.min(0, dx));
    }
  };

  useGesture({
    onStart: (pointers) => {
      const [pointer] = pointers.values();
      if (pointer === undefined) return;
      const x = pointer.start.x;
      const r: Run = {
        mode: x <= EDGE || x >= innerWidth - EDGE ? 'none' : 'pending',
        pointer,
        row: pointer.target?.closest<HTMLElement>('[data-article]')?.dataset
          .article,
        off: [],
        base: 0,
        page: 0,
      };
      run.current = r;
      if (r.mode === 'none') return;
      r.off.push(
        pointer.dx.on('change', () => step(r)),
        pointer.dy.on('change', () => step(r)),
      );
    },
    onPointer: (pointer) => {
      const r = run.current;
      if (r?.mode === 'pending' && pointer !== r.pointer) r.mode = 'none';
    },
    onEnd: (_pointers, { interrupted, preventClick }) => {
      const r = run.current;
      if (r === undefined) return;
      run.current = undefined;
      for (const off of r.off) off();
      const velocity = interrupted ? 0 : r.pointer.dx.getVelocity();
      if (r.mode === 'page') {
        preventClick();
        latest.current.pager.release(r.page, velocity);
      }
      if (r.mode === 'row') {
        preventClick();
        const dx = r.pointer.dx.get();
        const saves =
          !interrupted &&
          velocity < FLICK / 2 &&
          (-dx >= SAVE_AT || -velocity >= FLICK);
        if (saves && r.row !== undefined) latest.current.onSave(r.row);
        animate(rowX, 0, {
          ...SPRING,
          velocity,
          onComplete: () => setRow(undefined),
        });
      }
    },
  });

  return { row, rowX };
}
