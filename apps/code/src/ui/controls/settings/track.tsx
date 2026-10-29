import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
} from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  GestureZone,
  type SwipeRelease,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

/*
 * On a touch screen tabs sit side by side in one track, each drawn on its
 * own, the track showing one at a time: Settings' tabs, each scrolled on
 * its own.
 *
 * 1. Follow  a sideways drag moves the track with the finger, so the tab
 *            beside comes into view as the one open goes: right to left
 *            the next, left to right the one before. Up and down it wants
 *            nothing: the tab open, or what holds it, scrolls.
 * 2. Let go  past a fifth of the track's width, or flicked, it opens the
 *            tab beside; otherwise it springs back. A way with no tab
 *            there, such as before the first, is left to the zone around
 *            it: the App Shell's, whose swipe opens the sidebar.
 * 3. Settle  once another tab is open, by a swipe or a tap on its name,
 *            the track springs from where it was to it, as fast as the
 *            finger let go, and quicker the less it has to go.
 *
 * It moves by transform alone, from a motion value, so a frame renders
 * nothing. Under reduced motion it still follows the finger, but jumps
 * where it goes.
 */

/** Let go past this share of the width, or flicked past this many px/s, it goes. */
const SHARE = 0.2;
const FLICK = 300;

/** The longest a settle looks to take, across the whole width, and the shortest, in seconds. */
const LONGEST = 0.25;
const SHORTEST = 0.1;

/** The tabs on either side of the one open, among those shown; null where there is none. */
export const besideOf = <Tab extends string>(
  shown: ReadonlyArray<Tab>,
  open: Tab,
): {
  readonly before: Tab | null;
  readonly after: Tab | null;
} => {
  const at = shown.indexOf(open);
  return {
    before: at > 0 ? shown[at - 1]! : null,
    after: at !== -1 && at < shown.length - 1 ? shown[at + 1]! : null,
  };
};

const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The tabs shown, side by side, the one open in view; `heading` above
 * them, which a swipe on it moves them too. The track takes the height it
 * is given and each tab scrolls on its own. `slid` reads how far the track
 * is moved off the tab open, in px.
 */
export function TabTrack<Tab extends string>({
  open,
  shown,
  heading,
  panel,
  onChoose,
  slid,
  className,
}: {
  readonly open: Tab;
  readonly shown: ReadonlyArray<Tab>;
  readonly heading: ReactNode;
  readonly panel: (tab: Tab) => ReactNode;
  readonly onChoose: (tab: Tab) => void;
  readonly slid?: RefObject<MotionValue<number> | null>;
  readonly className?: string;
}) {
  const x = useMotionValue(0);
  const frame = useRef<HTMLDivElement>(null);
  const at = Math.max(0, shown.indexOf(open));
  if (slid) slid.current = x;
  return (
    <GestureZone className={cn('flex min-h-0 flex-col', className)}>
      <Follow
        open={open}
        shown={shown}
        x={x}
        frame={frame}
        onChoose={onChoose}
      />
      {heading}
      <div ref={frame} className="min-h-0 flex-1 overflow-clip">
        <div
          className="h-full"
          style={{ transform: `translateX(${-100 * at}%)` }}
        >
          <motion.div
            style={{ x }}
            className="relative h-full will-change-transform"
          >
            {/* Only the tab open sets the height; each sits at its place. */}
            {shown.map((tab, index) => (
              <div
                key={tab}
                inert={tab !== open}
                style={{ left: `${100 * index}%` }}
                className={cn(
                  'h-full w-full overflow-y-auto overscroll-y-contain',
                  tab === open ? 'relative' : 'absolute top-0',
                )}
              >
                {panel(tab)}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </GestureZone>
  );
}

/** Both ways' Swipes, each wanted only while there is a tab that way, and the settle once another is open. */
function Follow<Tab extends string>({
  open,
  shown,
  x,
  frame,
  onChoose,
}: {
  readonly open: Tab;
  readonly shown: ReadonlyArray<Tab>;
  readonly x: MotionValue<number>;
  readonly frame: RefObject<HTMLDivElement | null>;
  readonly onChoose: (tab: Tab) => void;
}) {
  const { before, after } = besideOf(shown, open);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  // Which way fingers move it now: -1 left, 1 right.
  const moving = useRef<-1 | 1 | null>(null);
  // Where it was as fingers took it, mid-settle perhaps.
  const base = useRef(0);
  const last = useRef({ open, at: shown.indexOf(open) });
  // How fast the finger let go, carried into the settle it starts.
  const flung = useRef(0);

  const width = () => frame.current?.offsetWidth || innerWidth;

  // 3. Settle
  const settle = (velocity: number) => {
    animation.current?.stop();
    const from = x.get();
    if (from === 0) return;
    if (reduced()) return x.jump(0);
    const share = Math.min(1, Math.abs(from) / width());
    animation.current = animate(x, 0, {
      type: 'spring',
      visualDuration: SHORTEST + (LONGEST - SHORTEST) * share,
      bounce: 0,
      velocity,
    });
  };

  // 1. Follow
  const grab = (sign: -1 | 1) => () => {
    animation.current?.stop();
    base.current = x.get();
    moving.current = sign;
  };

  // 2. Let go
  const release = (sign: -1 | 1, to: Tab | null) => (at?: SwipeRelease) => {
    if (moving.current !== sign) return;
    moving.current = null;
    const goes =
      to !== null &&
      at !== undefined &&
      (sign * x.get() >= width() * SHARE || at.velocity >= FLICK);
    const velocity = sign * (at?.velocity ?? 0);
    if (!goes) return settle(velocity);
    flung.current = velocity;
    onChoose(to);
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

  // The track moved to the tab open as it drew: moved back by as much, it
  // shows what it showed, and settles from there.
  useLayoutEffect(() => {
    const at = shown.indexOf(open);
    const was = last.current;
    last.current = { open, at };
    const velocity = flung.current;
    flung.current = 0;
    if (was.open === open || was.at === -1 || at === -1) return;
    x.jump(x.get() + (at - was.at) * width());
    settle(velocity);
  }, [open, shown]);

  useEffect(() => () => animation.current?.stop(), []);

  return null;
}
