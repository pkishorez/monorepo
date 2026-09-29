import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { type SwipeRelease, useSwipe } from '../../recognizers';

export type SidebarOptions = {
  /** The screen edge it lives on. */
  readonly side: 'left' | 'right';
  /** Its width in px: how far it travels. */
  readonly width: number;
  /** Whether it is open, when the app controls it. */
  readonly open?: boolean;
  /** Whether it starts open, when it controls itself. */
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** How far from `side`, in px, a Swipe must start to open it: 24 by default. */
  readonly edge?: number;
  /** Whether Swipes open and close it: true by default. */
  readonly enabled?: boolean;
};

export type Sidebar = {
  /** Its translateX in px: `-width` or `width` closed, 0 open. */
  readonly x: MotionValue<number>;
  /** 0 closed to 1 open, for a scrim. */
  readonly progress: MotionValue<number>;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  /** Whether fingers are moving it now. */
  readonly dragging: boolean;
};

const SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const;

/**
 * A sidebar that follows a Swipe from its edge to open and a Swipe back from
 * anywhere to close, then settles open or closed by where the fingers'
 * momentum would carry it, past half its width.
 */
export function useSidebar(options: SidebarOptions): Sidebar {
  const { side, width, edge = 24, enabled = true } = options;
  const [own, setOwn] = useState(options.defaultOpen ?? false);
  const open = options.open ?? own;
  // Which way opening moves x, and x when closed.
  const sign = side === 'left' ? 1 : -1;
  const closed = -sign * width;
  const at = (amount: number) =>
    closed + sign * Math.min(Math.max(amount, 0), width);

  const x = useMotionValue(at(open ? width : 0));
  const progress = useTransform(x, [closed, 0], [0, 1]);
  const moving = useRef<'open' | 'close' | undefined>(undefined);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  // Where it is headed, so settling after a Swipe is not redone as `open` catches up.
  const target = useRef(open);

  const settle = (next: boolean, velocity = 0) => {
    moving.current = undefined;
    target.current = next;
    animation.current?.stop();
    animation.current = animate(x, at(next ? width : 0), {
      ...SPRING,
      velocity,
    });
  };

  const change = (next: boolean) => {
    if (next === open) return;
    if (options.open === undefined) setOwn(next);
    options.onOpenChange?.(next);
  };

  const setOpen = (next: boolean) => {
    settle(next);
    change(next);
  };

  useEffect(() => {
    if (target.current !== open) settle(open);
  });

  const grab = (way: 'open' | 'close') => () => {
    animation.current?.stop();
    moving.current = way;
  };

  // Opening Swipes measure toward open, closing ones toward closed.
  const release = (way: 'open' | 'close') => (at?: SwipeRelease) => {
    if (moving.current !== way) return;
    if (at === undefined) return settle(open);
    const opens =
      way === 'open' ? at.projected >= width / 2 : at.projected < width / 2;
    settle(opens, (way === 'open' ? sign : -sign) * at.velocity);
    change(opens);
  };

  const opening = useSwipe({
    enabled: enabled && !open,
    direction: side === 'left' ? 'right' : 'left',
    from: { edge: side, within: edge },
    onStart: grab('open'),
    onCommit: release('open'),
    onCancel: (_reason, at) => release('open')(at),
  });
  const closing = useSwipe({
    enabled: enabled && open,
    direction: side === 'left' ? 'left' : 'right',
    onStart: grab('close'),
    onCommit: release('close'),
    onCancel: (_reason, at) => release('close')(at),
  });

  useEffect(() => {
    const offOpen = opening.offset.on('change', (offset) => {
      if (moving.current === 'open') x.set(at(offset));
    });
    const offClose = closing.offset.on('change', (offset) => {
      if (moving.current === 'close') x.set(at(width - offset));
    });
    return () => {
      offOpen();
      offClose();
    };
  });

  useEffect(() => () => animation.current?.stop(), []);

  return {
    x,
    progress,
    open,
    setOpen,
    dragging: opening.state === 'tracking' || closing.state === 'tracking',
  };
}
