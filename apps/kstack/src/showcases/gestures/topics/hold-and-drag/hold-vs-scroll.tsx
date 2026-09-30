import { GripVerticalIcon } from '@kstackz/ui-toolkit/lucide';
import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import {
  type AnimationPlaybackControls,
  animate,
  motion,
  motionValue,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const HOLD_MS = 400;
// How far the finger may drift during the hold before it counts as a drag.
const SLOP = 8;
const ROWS = 24;
const ROW_HEIGHT = 48;
const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.25 } as const;

const IDS = Array.from({ length: ROWS }, (_, i) => i + 1);

/**
 * A list where a quick drag scrolls and a still hold lifts the row, which
 * then follows the finger to a new place. The browser decides a touch at its
 * first movement, often a finger's tremor before any hold could end, so the
 * zone keeps every touch here and scrolls the list itself.
 */
export function HoldVsScroll() {
  const scroller = useRef<HTMLDivElement>(null);
  const momentum = useRef<AnimationPlaybackControls>(undefined);
  const stop = useRef<() => void>(undefined);
  const [order, setOrder] = useState(IDS);
  const [positions] = useState(
    () => new Map(IDS.map((id, i) => [id, motionValue(i * ROW_HEIGHT)])),
  );
  const [mode, setMode] = useState<'holding' | 'scrolling' | 'lifted'>();
  const [lifted, setLifted] = useState<number>();
  useStageStatus(
    mode === 'lifted' && lifted !== undefined
      ? `Row ${lifted} lifted · place ${order.indexOf(lifted) + 1}`
      : mode === 'holding'
        ? 'Holding…'
        : mode === 'scrolling'
          ? 'Scrolling'
          : undefined,
  );

  // Every row but the lifted one springs to its place.
  useEffect(() => {
    order.forEach((id, i) => {
      if (id !== lifted) animate(positions.get(id)!, i * ROW_HEIGHT, SPRING);
    });
  }, [order, lifted, positions]);

  // The lifted row follows the finger; where it is decides its place.
  const drag = (id: number, finger: Pointer) => {
    const y = positions.get(id)!;
    y.stop();
    const from = y.get() - finger.dy.get();
    return finger.dy.on('change', (dy) => {
      y.set(from + dy);
      const to = Math.min(
        Math.max(Math.round(y.get() / ROW_HEIGHT), 0),
        ROWS - 1,
      );
      setOrder((now) => {
        if (now.indexOf(id) === to) return now;
        const next = now.filter((other) => other !== id);
        next.splice(to, 0, id);
        return next;
      });
    });
  };

  // The list follows the finger, and glides on when it lets go.
  const scroll = (finger: Pointer) => {
    const list = scroller.current!;
    const from = list.scrollTop + finger.dy.get();
    const off = finger.dy.on('change', (dy) => {
      list.scrollTop = from - dy;
    });
    return () => {
      off();
      momentum.current = animate(list.scrollTop, 0, {
        type: 'inertia',
        velocity: -finger.dy.getVelocity(),
        min: 0,
        max: list.scrollHeight - list.clientHeight,
        onUpdate: (top) => (list.scrollTop = top),
      });
    };
  };

  useGesture({
    onStart: (pointers) => {
      momentum.current?.stop();
      const [finger] = pointers.values();
      if (finger === undefined) return;
      const row =
        finger.target?.closest<HTMLElement>('[data-row]')?.dataset.row;
      const id = row === undefined ? undefined : Number(row);
      setMode(id === undefined ? undefined : 'holding');
      const timer = setTimeout(() => {
        if (id === undefined) return;
        offs.forEach((off) => off());
        setMode('lifted');
        setLifted(id);
        stop.current = drag(id, finger);
      }, HOLD_MS);
      const drift = () => {
        if (Math.hypot(finger.dx.get(), finger.dy.get()) <= SLOP) return;
        clearTimeout(timer);
        offs.forEach((off) => off());
        setMode('scrolling');
        stop.current = scroll(finger);
      };
      const offs = [
        finger.dx.on('change', drift),
        finger.dy.on('change', drift),
      ];
      stop.current = () => {
        clearTimeout(timer);
        offs.forEach((off) => off());
      };
    },
    onEnd: (_, end) => {
      stop.current?.();
      stop.current = undefined;
      if (mode === 'lifted') end.preventClick();
      setMode(undefined);
      setLifted(undefined);
    },
  });

  return (
    <div
      ref={scroller}
      data-zone-gesture="enabled"
      className="absolute inset-0 overflow-y-auto"
    >
      <div className="relative" style={{ height: ROWS * ROW_HEIGHT }}>
        {IDS.map((id) => (
          <motion.div
            key={id}
            data-row={id}
            data-lifted={lifted === id ? '' : undefined}
            className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-border bg-card px-4 text-sm data-lifted:z-10 data-lifted:rounded-md data-lifted:border-transparent data-lifted:shadow-xl"
            style={{ height: ROW_HEIGHT, y: positions.get(id)! }}
            animate={{ scale: lifted === id ? 1.03 : 1 }}
            transition={SPRING}
          >
            <GripVerticalIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            Row {id}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
