import { useGesture, type Pointer } from '@kstackz/use-gesture/core';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  useMotionValue,
} from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The strips along the screen's sides that belong to the sidebars, in px. */
export const EDGE = 24;
/** How far an open row slides to show its two actions, in px. */
export const ACTIONS = 144;
/** How far a row slides right to toggle read, in px. */
export const READ_AT = 72;
/** How much of its width a row slides left to go at once. */
export const AWAY_AT = 0.6;

// Quick and flat, like the sidebars.
const SPRING = { type: 'spring', visualDuration: 0.22, bounce: 0 } as const;
// Seconds of momentum a release carries, to choose where a row settles.
const MOMENTUM = 0.15;

/** A row under a finger: its mail, and how wide it is. */
export type Grip = { readonly id: string; readonly width: number };

/** The row a touch landed on, unless it landed on a screen edge, which the sidebars own. */
export const rowAt = (pointer: Pointer): Grip | undefined => {
  if (pointer.start.x <= EDGE || pointer.start.x >= innerWidth - EDGE) return;
  const row = pointer.target?.closest<HTMLElement>('[data-row]');
  const id = row?.dataset.row;
  return row && id ? { id, width: row.offsetWidth } : undefined;
};

export type RowSwipe = {
  /** The row that is moving or open. Only one ever is. */
  readonly id: string | undefined;
  /** Its offset in px: right to toggle read, left to show its actions. */
  readonly x: MotionValue<number>;
  /** Whether its actions are showing and it is at rest. */
  readonly open: boolean;
  readonly close: () => void;
  /** Slides the row out to the left, then `then` acts on its mail. */
  readonly away: (then: (id: string) => void, velocity?: number) => void;
  readonly grip: () => Grip | undefined;
  readonly grab: (grip: Grip | undefined) => boolean;
  readonly follow: (dx: number) => void;
  readonly release: (velocity: number | undefined) => void;
};

/**
 * The one row that moves: it follows a Swipe and, at release, toggles read,
 * shows its actions, goes away past AWAY_AT, or shuts.
 */
export function useRowSwipe(actions: {
  readonly onToggleRead: (id: string) => void;
  readonly onAway: (id: string) => void;
}): RowSwipe {
  const x = useMotionValue(0);
  const [id, setId] = useState<string>();
  const [open, setOpen] = useState(false);
  const grip = useRef<Grip | undefined>(undefined);
  const base = useRef(0);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  useEffect(() => () => animation.current?.stop(), []);

  const to = (target: number, velocity = 0) => {
    animation.current?.stop();
    animation.current = animate(x, target, { ...SPRING, velocity });
    return animation.current;
  };

  const settle = (target: number, velocity = 0) => {
    setOpen(target !== 0);
    const settling = grip.current;
    void to(target, velocity).finished.then(() => {
      if (target !== 0 || grip.current !== settling) return;
      grip.current = undefined;
      setId(undefined);
    });
  };

  const away = (then: (id: string) => void, velocity = 0) => {
    const going = grip.current;
    if (going === undefined) return;
    setOpen(false);
    void to(-going.width, velocity).finished.then(() => {
      // x stays out, as the row collapses; the next grab resets it.
      grip.current = undefined;
      setId(undefined);
      then(going.id);
    });
  };

  return {
    id,
    x,
    open,
    close: () => {
      if (grip.current !== undefined) settle(0);
    },
    away,
    grip: () => grip.current,
    grab: (next) => {
      if (next === undefined) return false;
      animation.current?.stop();
      if (grip.current?.id !== next.id) x.jump(0);
      grip.current = next;
      base.current = x.get();
      setId(next.id);
      return true;
    },
    follow: (dx) => {
      const width = grip.current?.width ?? 0;
      // An open row only shuts to the right; a shut one gives way past READ_AT.
      const at = base.current + dx;
      if (base.current < 0) return x.set(Math.max(Math.min(at, 0), -width));
      x.set(at > READ_AT ? READ_AT + (at - READ_AT) / 3 : Math.max(at, -width));
    },
    release: (velocity) => {
      const held = grip.current;
      if (held === undefined) return;
      const at = x.get();
      if (velocity === undefined)
        return settle(base.current < 0 ? -ACTIONS : 0);
      if (-at >= held.width * AWAY_AT)
        return away(latest.current.onAway, velocity);
      if (at >= READ_AT) {
        latest.current.onToggleRead(held.id);
        return settle(0, velocity);
      }
      settle(at + velocity * MOMENTUM < -ACTIONS / 2 ? -ACTIONS : 0, velocity);
    },
  };
}

/**
 * Swipes left and right that move `swipe`'s row, for the row `pick` finds
 * under the first finger. Put it in the zone whose touches should move rows.
 * A touch that moved the row never also clicks it.
 */
export function useRowDrag(
  swipe: RowSwipe,
  options: {
    readonly enabled: boolean;
    readonly pick: (pointer: Pointer) => Grip | undefined;
  },
) {
  const landed = useRef<Grip | undefined>(undefined);
  const moving = useRef<'left' | 'right' | undefined>(undefined);
  const moved = useRef(false);

  useGesture({
    enabled: options.enabled,
    onStart: (pointers) => {
      const [first] = pointers.values();
      landed.current = first === undefined ? undefined : options.pick(first);
      moved.current = false;
    },
    onEnd: (_pointers, end) => {
      if (moved.current) end.preventClick();
    },
  });

  const start = (way: 'left' | 'right') => () => {
    if (!swipe.grab(landed.current)) return;
    moving.current = way;
    moved.current = true;
  };
  const end = (way: 'left' | 'right') => (at?: SwipeRelease) => {
    if (moving.current !== way) return;
    moving.current = undefined;
    swipe.release(at && (way === 'left' ? -at.velocity : at.velocity));
  };
  const left = useSwipe({
    enabled: options.enabled,
    direction: 'left',
    onStart: start('left'),
    onCommit: end('left'),
    onCancel: (_reason, at) => end('left')(at),
  });
  const right = useSwipe({
    enabled: options.enabled,
    direction: 'right',
    onStart: start('right'),
    onCommit: end('right'),
    onCancel: (_reason, at) => end('right')(at),
  });

  useEffect(() => {
    const offLeft = left.offset.on('change', (offset) => {
      if (moving.current === 'left') swipe.follow(-offset);
    });
    const offRight = right.offset.on('change', (offset) => {
      if (moving.current === 'right') swipe.follow(offset);
    });
    return () => {
      offLeft();
      offRight();
    };
  });
}
