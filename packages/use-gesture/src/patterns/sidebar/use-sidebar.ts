import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { type SwipeRelease, useSwipe } from '../../recognizers/index.ts';

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
  /**
   * Opt in to opening only from a strip along `side`, this many px wide. A
   * touch that starts there is always the sidebar's, even over a list that
   * scrolls. Without it, a Swipe that starts anywhere opens it.
   */
  readonly edge?: number;
  /** Whether Swipes open and close it: true by default. */
  readonly enabled?: boolean;
};

export type Sidebar = {
  /** Its translateX in px: `-width` or `width` closed, 0 open, never past either. */
  readonly x: MotionValue<number>;
  /** 0 closed to 1 open, for a scrim. */
  readonly progress: MotionValue<number>;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  /** Whether fingers are moving it now. */
  readonly dragging: boolean;
};

// Drawer-fast, no bounce; shutting is quicker than opening, as the eye has
// already moved on. A Swipe's velocity still carries into either.
const OPEN_SPRING = {
  type: 'spring',
  visualDuration: 0.25,
  bounce: 0,
} as const;
const CLOSE_SPRING = {
  type: 'spring',
  visualDuration: 0.2,
  bounce: 0,
} as const;

/**
 * A sidebar that follows a Swipe toward open, from anywhere or only from its
 * `edge`, and a Swipe back from anywhere to close, then settles open or
 * closed by where the fingers' momentum would carry it, past half its width.
 */
export function useSidebar(options: SidebarOptions): Sidebar {
  const { side, width, edge, enabled = true } = options;
  const [own, setOwn] = useState(options.defaultOpen ?? false);
  const open = options.open ?? own;
  // Which way opening moves x, and x when closed.
  const sign = side === 'left' ? 1 : -1;
  const closed = -sign * width;
  const at = (amount: number) =>
    closed + sign * Math.min(Math.max(amount, 0), width);

  // Where the springs put it, which may overshoot; `x` stops dead at both ends.
  const position = useMotionValue(at(open ? width : 0));
  const x = useMotionValue(position.get());
  useEffect(
    () =>
      position.on('change', (v) =>
        x.set(Math.min(Math.max(v, Math.min(closed, 0)), Math.max(closed, 0))),
      ),
    [position, x, closed],
  );
  const progress = useTransform(x, [closed, 0], [0, 1]);
  const moving = useRef<'open' | 'close' | undefined>(undefined);
  // How open it was, in px, when fingers took it.
  const base = useRef(0);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  // Where it is headed, so settling after a Swipe is not redone as `open` catches up.
  const target = useRef(open);

  const settle = (next: boolean, velocity = 0) => {
    moving.current = undefined;
    target.current = next;
    animation.current?.stop();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      position.jump(at(next ? width : 0));
      return;
    }
    animation.current = animate(position, at(next ? width : 0), {
      ...(next ? OPEN_SPRING : CLOSE_SPRING),
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

  // Fingers take it from wherever it is, even mid-spring.
  const grab = (way: 'open' | 'close') => () => {
    animation.current?.stop();
    base.current = sign * (x.get() - closed);
    moving.current = way;
  };

  // Opening Swipes measure toward open, closing ones toward closed.
  const release = (way: 'open' | 'close') => (at?: SwipeRelease) => {
    if (moving.current !== way) return;
    if (at === undefined) return settle(open);
    const headed =
      way === 'open'
        ? base.current + at.projected
        : base.current - at.projected;
    const opens = headed >= width / 2;
    settle(opens, (way === 'open' ? sign : -sign) * at.velocity);
    change(opens);
  };

  const opening = useSwipe({
    enabled: enabled && !open,
    direction: side === 'left' ? 'right' : 'left',
    ...(edge === undefined ? {} : { from: { edge: side, within: edge } }),
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
      if (moving.current === 'open') position.set(at(base.current + offset));
    });
    const offClose = closing.offset.on('change', (offset) => {
      if (moving.current === 'close') position.set(at(base.current - offset));
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
