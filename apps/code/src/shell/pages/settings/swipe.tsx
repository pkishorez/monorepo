import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
} from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  GestureZone,
  type SwipeRelease,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import type { SettingsTab } from '../../routes/index.ts';

/*
 * On a touch screen the Settings page swipes between its tabs: right to
 * left to the next, left to right to the one before. The page open follows
 * the finger (`Sliding`); let go past a third of the screen, or flicked,
 * it slides out and the tab beside slides in from the other side, and
 * otherwise springs back. A way with no tab there, such as before the
 * first, is left to the zone around it, the App Shell's, whose swipe opens
 * the sidebar. Up and down it wants nothing: the page scrolls. Under
 * reduced motion the page still follows the finger, but jumps where it
 * goes. It moves by transform alone, from motion values, so a frame
 * renders nothing.
 */

/** Let go past this share of the screen, or flicked past this many px/s, it goes. */
const SHARE = 0.3;
const FLICK = 400;

// Out is quicker than in, as the eye has already moved on.
const OUT = { type: 'spring', visualDuration: 0.14, bounce: 0 } as const;
const IN = { type: 'spring', visualDuration: 0.22, bounce: 0 } as const;

/** The tabs on either side of the one open, among those shown; null where there is none. */
export const besideOf = (
  shown: ReadonlyArray<SettingsTab>,
  open: SettingsTab,
): {
  readonly before: SettingsTab | null;
  readonly after: SettingsTab | null;
} => {
  const at = shown.indexOf(open);
  return {
    before: at > 0 ? shown[at - 1]! : null,
    after: at !== -1 && at < shown.length - 1 ? shown[at + 1]! : null,
  };
};

const Slide = createContext<MotionValue<number> | null>(null);

/** How far the page open is moved sideways, in px; 0 at rest. */
export const useSlide = () => {
  const x = use(Slide);
  if (x === null) throw new Error('useSlide must be used inside a TabSwipe');
  return x;
};

export function TabSwipe({
  open,
  shown,
  enabled,
  onSwipe,
  className,
  children,
}: {
  readonly open: SettingsTab;
  readonly shown: ReadonlyArray<SettingsTab>;
  /** On a touch screen only. */
  readonly enabled: boolean;
  readonly onSwipe: (tab: SettingsTab) => void;
  readonly className?: string;
  /** The whole page; what moves is in `Sliding`. */
  readonly children: ReactNode;
}) {
  const { before, after } = besideOf(shown, open);
  const x = useMotionValue(0);
  return (
    <GestureZone className={cn('overflow-x-clip', className)}>
      <Slide value={x}>
        <Follow
          open={open}
          before={enabled ? before : null}
          after={enabled ? after : null}
          onSwipe={onSwipe}
        />
        {children}
      </Slide>
    </GestureZone>
  );
}

/** The page open, moved as the finger moves it. */
export function Sliding({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <motion.div style={{ x: useSlide() }} className={className}>
      {children}
    </motion.div>
  );
}

const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Both ways' Swipes, each wanted only while there is a tab that way. */
function Follow({
  open,
  before,
  after,
  onSwipe,
}: {
  readonly open: SettingsTab;
  readonly before: SettingsTab | null;
  readonly after: SettingsTab | null;
  readonly onSwipe: (tab: SettingsTab) => void;
}) {
  const x = useSlide();
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  // Which way fingers move it now: -1 left, 1 right.
  const moving = useRef<-1 | 1 | null>(null);
  // Where it was as fingers took it, mid-spring perhaps.
  const base = useRef(0);
  // The side the tab swiped to comes in from, until it is open.
  const incoming = useRef<-1 | 1 | null>(null);

  const settle = (
    to: number,
    velocity: number,
    spring: typeof IN | typeof OUT,
    then?: () => void,
  ) => {
    animation.current?.stop();
    if (reduced()) {
      x.jump(to);
      then?.();
      return;
    }
    animation.current = animate(x, to, {
      ...spring,
      velocity,
      ...(then === undefined ? {} : { onComplete: then }),
    });
  };

  const grab = (sign: -1 | 1) => () => {
    if (incoming.current !== null) return;
    animation.current?.stop();
    base.current = x.get();
    moving.current = sign;
  };

  const release =
    (sign: -1 | 1, to: SettingsTab | null) => (at?: SwipeRelease) => {
      if (moving.current !== sign) return;
      moving.current = null;
      const velocity = sign * (at?.velocity ?? 0);
      const goes =
        to !== null &&
        at !== undefined &&
        (at.offset >= innerWidth * SHARE || at.velocity >= FLICK);
      if (!goes) return settle(0, velocity, IN);
      incoming.current = -sign as -1 | 1;
      settle(sign * innerWidth, velocity, OUT, () => onSwipe(to));
    };

  const left = useSwipe({
    enabled: after !== null,
    direction: 'left',
    commit: { distance: innerWidth * SHARE, velocity: FLICK },
    onStart: grab(-1),
    onCommit: release(-1, after),
    onCancel: (_reason, at) => release(-1, after)(at),
  });
  const right = useSwipe({
    enabled: before !== null,
    direction: 'right',
    commit: { distance: innerWidth * SHARE, velocity: FLICK },
    onStart: grab(1),
    onCommit: release(1, before),
    onCancel: (_reason, at) => release(1, before)(at),
  });

  useEffect(() => {
    const offLeft = left.offset.on('change', (offset) => {
      if (moving.current === -1) x.set(base.current - offset);
    });
    const offRight = right.offset.on('change', (offset) => {
      if (moving.current === 1) x.set(base.current + offset);
    });
    return () => {
      offLeft();
      offRight();
    };
  }, [left.offset, right.offset, x]);

  // The tab swiped to comes in from the side opposite the one left.
  useLayoutEffect(() => {
    const from = incoming.current;
    if (from === null) return;
    incoming.current = null;
    x.jump(from * innerWidth);
    settle(0, 0, IN);
  }, [open]);

  useEffect(() => () => animation.current?.stop(), []);

  return null;
}
