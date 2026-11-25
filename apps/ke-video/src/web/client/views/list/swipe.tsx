import {
  animate,
  type AnimationPlaybackControls,
  motion,
  type MotionValue,
  useMotionValue,
} from 'motion/react';
import {
  GestureZone,
  type SwipeRelease,
  useGesture,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import { type ReactNode, useEffect, useRef } from 'react';
import { inGutter, ROW_FLICK, rowAt, rowOpens } from '../../touch/index.ts';

/*
 * A list row a finger swipes left to show what can be done to it, as in
 * iOS Mail: it follows the finger, and let go past half its actions, or
 * flicked, it stays open on them; otherwise it springs shut. Swiped right,
 * an open row shuts. One row is open at a time, and a tap anywhere else or
 * a scroll shuts it; a tap on the open row itself shuts it without opening
 * the Video. A touch landing in the 20 px along either side edge is the
 * browser's, and a mouse never swipes: the row's "⋯" menu has the same
 * actions for a mouse, a keyboard and a screen reader.
 */

const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Px a scroll goes, with a row open, before the row shuts. */
const SCROLL_SHUTS = 8;

/**
 * Shuts the open row on a tap outside it or a scroll, and stops a tap on
 * the row itself from opening it: what `Rows` runs while one is open.
 */
export const useShut = (open: string | null, shut: () => void) => {
  useEffect(() => {
    if (open === null) return;
    const row = () =>
      document.querySelector(`[data-row="${CSS.escape(open)}"]`);
    const down = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      const inside = target !== null && row()?.contains(target);
      if (!inside) shut();
    };
    const from = scrollY;
    const scrolled = () => {
      if (Math.abs(scrollY - from) > SCROLL_SHUTS) shut();
    };
    addEventListener('pointerdown', down, { capture: true });
    addEventListener('scroll', scrolled, { passive: true });
    return () => {
      removeEventListener('pointerdown', down, { capture: true });
      removeEventListener('scroll', scrolled);
    };
  }, [open, shut]);
};

export function SwipeRow({
  id,
  open,
  width,
  enabled,
  onOpen,
  onShut,
  actions,
  children,
}: {
  /** The Video, by its id: marks the row for `useShut`. */
  readonly id: string;
  readonly open: boolean;
  /** How wide its actions are, together, in px. */
  readonly width: number;
  readonly enabled: boolean;
  readonly onOpen: () => void;
  readonly onShut: () => void;
  /** What shows behind the row as it opens, at its right. */
  readonly actions: ReactNode;
  readonly children: ReactNode;
}) {
  const x = useMotionValue(0);
  return (
    <GestureZone
      data-row={id}
      style={{ touchAction: 'pan-y' }}
      className="relative overflow-hidden"
    >
      <Follow
        x={x}
        open={open}
        width={width}
        enabled={enabled}
        onOpen={onOpen}
        onShut={onShut}
      />
      <div
        inert={!open}
        className="absolute inset-y-0 right-0 flex"
        style={{ width }}
      >
        {actions}
      </div>
      <motion.div
        style={{ x }}
        onClickCapture={(event) => {
          if (!open) return;
          event.preventDefault();
          event.stopPropagation();
          onShut();
        }}
        className="relative bg-background"
      >
        {children}
      </motion.div>
    </GestureZone>
  );
}

/** Both ways' Swipes, and the row going where `open` says. */
function Follow({
  x,
  open,
  width,
  enabled,
  onOpen,
  onShut,
}: {
  readonly x: MotionValue<number>;
  readonly open: boolean;
  readonly width: number;
  readonly enabled: boolean;
  readonly onOpen: () => void;
  readonly onShut: () => void;
}) {
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  // Which way fingers move it now: -1 left, 1 right.
  const moving = useRef<-1 | 1 | null>(null);
  const base = useRef(0);
  const gutter = useRef(false);
  // Where it is going, or rests.
  const target = useRef(0);

  const go = (to: number, velocity = 0) => {
    target.current = to;
    animation.current?.stop();
    if (reduced()) return x.jump(to);
    animation.current = animate(x, to, { ...SPRING, velocity });
  };

  // Shut from outside, by another row opening, a tap or a scroll.
  useEffect(() => {
    const to = open ? -width : 0;
    if (moving.current !== null || target.current === to) return;
    go(to);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- follows `open` and `width` alone.
  }, [open, width]);
  useEffect(() => () => animation.current?.stop(), []);

  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      gutter.current =
        first !== undefined && inGutter(first.start.x, innerWidth);
    },
  });

  const grab = (sign: -1 | 1) => () => {
    if (gutter.current) return;
    animation.current?.stop();
    base.current = x.get();
    moving.current = sign;
  };
  const release = (sign: -1 | 1) => (at?: SwipeRelease) => {
    if (moving.current !== sign) return;
    moving.current = null;
    // Px/s, positive to the right.
    const velocity = sign * (at?.velocity ?? 0);
    const opens = rowOpens(x.get(), velocity, width);
    go(opens ? -width : 0, velocity);
    if (opens) onOpen();
    else onShut();
  };

  const commit = { distance: width / 2, velocity: ROW_FLICK };
  const left = useSwipe({
    enabled,
    direction: 'left',
    commit,
    onStart: grab(-1),
    onCommit: release(-1),
    onCancel: (_reason, at) => release(-1)(at),
  });
  const right = useSwipe({
    enabled: enabled && open,
    direction: 'right',
    commit,
    onStart: grab(1),
    onCommit: release(1),
    onCancel: (_reason, at) => release(1)(at),
  });

  useEffect(() => {
    const offLeft = left.offset.on('change', (offset) => {
      if (moving.current === -1) x.set(rowAt(base.current, -offset, width));
    });
    const offRight = right.offset.on('change', (offset) => {
      if (moving.current === 1) x.set(rowAt(base.current, offset, width));
    });
    return () => {
      offLeft();
      offRight();
    };
  }, [left.offset, right.offset, x, width]);

  return null;
}
