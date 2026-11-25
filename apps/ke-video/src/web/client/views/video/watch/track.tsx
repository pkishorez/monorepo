import {
  animate,
  type AnimationPlaybackControls,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react';
import {
  GestureZone,
  type SwipeRelease,
  useGesture,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { besideOf, inGutter, tabAfter, tabRule } from '../../../touch/index.ts';

/*
 * On a phone or tablet the tabs' panels sit side by side, the one open in
 * view, and a sideways swipe on it moves them with the finger:
 *
 * 1. Follow  right to left brings the next tab in, left to right the one
 *            before; the tabs' underline follows. Up and down is the
 *            page's scroll, and a touch landing in the 20 px along either
 *            side edge is the browser's back and forward.
 * 2. Let go  past a quarter of the width, or flicked, it opens the tab
 *            beside; otherwise it springs back.
 * 3. Settle  once another tab is open, by a swipe or a tap on its name,
 *            the panels spring to it, as fast as the finger let go.
 *
 * Each tab keeps how far it was read, and opens there again. The panels
 * move by transform alone; under reduced motion they still follow the
 * finger, but jump where they go.
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where what stays at the top ends, in viewport px: the tabs' bottom. */
const pinnedBottom = () =>
  document.querySelector('[data-pinned]')?.getBoundingClientRect().bottom ?? 0;

/** The longest and shortest a settle looks to take, in seconds. */
const LONGEST = 0.3;
const SHORTEST = 0.12;

export type Track<Tab extends string> = ReturnType<typeof useTrack<Tab>>;

/**
 * The panels' place and what moves them: `choose` opens a tab from a tap
 * on its name as a swipe does, keeping where the one left was read.
 */
export function useTrack<Tab extends string>(
  shown: ReadonlyArray<Tab>,
  open: Tab,
  onChoose: (tab: Tab) => void,
) {
  const x = useMotionValue(0);
  const at = useMotionValue(Math.max(0, shown.indexOf(open)));
  const zone = useRef<HTMLDivElement>(null);
  // How far into each tab it was read, in px below the tabs.
  const memory = useRef(new Map<Tab, number>());
  // Where the page scrolls to once the tab chosen draws.
  const restore = useRef<number | null>(null);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  // Counts each grab and settle: only the latest settle, finishing, hides
  // the panels beside.
  const run = useRef(0);
  // How fast the finger let go, carried into the settle it starts.
  const flung = useRef(0);
  const last = useRef({ open, at: shown.indexOf(open) });
  // While they move, the panels beside show, each shifted so what was
  // read of it lines up under the tabs.
  const [moving, setMoving] = useState(false);
  const [peek, setPeek] = useState<ReadonlyMap<Tab, number>>(new Map());

  const width = () => zone.current?.offsetWidth || innerWidth;
  // How far into the open tab the top of what can be seen is, in px.
  const seen = () => {
    const element = zone.current;
    return element === null
      ? 0
      : pinnedBottom() - element.getBoundingClientRect().top;
  };
  const peekAll = (from: Tab) => {
    run.current += 1;
    const visible = seen();
    setPeek(
      new Map(
        shown
          .filter((tab) => tab !== from)
          .map((tab) => [
            tab,
            visible > 0 ? visible - (memory.current.get(tab) ?? 0) : 0,
          ]),
      ),
    );
    setMoving(true);
  };

  const settle = (velocity: number) => {
    animation.current?.stop();
    const from = x.get();
    if (from === 0 || reduced()) {
      x.jump(0);
      setMoving(false);
      return;
    }
    const share = Math.min(1, Math.abs(from) / width());
    const mine = ++run.current;
    animation.current = animate(x, 0, {
      type: 'spring',
      visualDuration: SHORTEST + (LONGEST - SHORTEST) * share,
      bounce: 0,
      velocity,
    });
    void animation.current.finished.then(() => {
      if (run.current === mine) setMoving(false);
    });
  };

  const choose = (tab: Tab) => {
    if (tab === open) return;
    const visible = seen();
    const read = memory.current.get(tab) ?? 0;
    memory.current.set(open, Math.max(0, visible));
    // Back where it was read, or its top just under the tabs; left as it
    // is when neither tab has scrolled under them.
    restore.current = read > 0 || visible > 0 ? scrollY + read - visible : null;
    onChoose(tab);
  };

  // The panels moved to the tab open as it drew: moved back by as much,
  // they show what they showed, and settle from there.
  useLayoutEffect(() => {
    const index = shown.indexOf(open);
    const was = last.current;
    last.current = { open, at: index };
    at.set(Math.max(0, index));
    if (was.open === open || was.at === -1 || index === -1) return;
    if (restore.current !== null) {
      scrollTo({ top: restore.current, behavior: 'instant' });
      restore.current = null;
    }
    peekAll(open);
    const velocity = flung.current;
    flung.current = 0;
    x.jump(x.get() + (index - was.at) * width());
    settle(velocity);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs as the tab open changes.
  }, [open, shown]);

  useEffect(() => () => animation.current?.stop(), []);

  return {
    x,
    at,
    zone,
    moving,
    peek,
    choose,
    settle,
    flung,
    peekAll,
    width,
    stop: () => animation.current?.stop(),
  };
}

/** The open tab's underline: under its name, and following a swipe. */
export function Underline<Tab extends string>({
  track,
  count,
}: {
  readonly track: Track<Tab>;
  readonly count: number;
}) {
  const x = useTransform(
    () => `${(track.at.get() - track.x.get() / track.width()) * 100}%`,
  );
  return (
    <motion.span
      aria-hidden
      style={{ x, width: `${100 / count}%` }}
      className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-foreground"
    />
  );
}

/** Both ways' Swipes, each wanted only while there is a tab that way. */
function Follow<Tab extends string>({
  track,
  shown,
  open,
}: {
  readonly track: Track<Tab>;
  readonly shown: ReadonlyArray<Tab>;
  readonly open: Tab;
}) {
  const { before, after } = besideOf(shown, open);
  // Which way fingers move the panels now: -1 left, 1 right.
  const moving = useRef<-1 | 1 | null>(null);
  // Where the panels were as fingers took them, mid-settle perhaps.
  const base = useRef(0);
  const gutter = useRef(false);

  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      gutter.current =
        first !== undefined && inGutter(first.start.x, innerWidth);
    },
  });

  const grab = (sign: -1 | 1) => () => {
    if (gutter.current) return;
    track.stop();
    base.current = track.x.get();
    moving.current = sign;
    track.peekAll(open);
  };

  const release =
    (sign: -1 | 1, way: 'left' | 'right') => (at?: SwipeRelease) => {
      if (moving.current !== sign) return;
      moving.current = null;
      const to =
        at === undefined ? open : tabAfter(shown, open, way, at, track.width());
      const velocity = sign * (at?.velocity ?? 0);
      if (to === open) return track.settle(velocity);
      track.flung.current = velocity;
      track.choose(to);
    };

  const left = useSwipe({
    enabled: after !== null,
    direction: 'left',
    commit: tabRule(innerWidth),
    onStart: grab(-1),
    onCommit: release(-1, 'left'),
    onCancel: (_reason, at) => release(-1, 'left')(at),
  });
  const right = useSwipe({
    enabled: before !== null,
    direction: 'right',
    commit: tabRule(innerWidth),
    onStart: grab(1),
    onCommit: release(1, 'right'),
    onCancel: (_reason, at) => release(1, 'right')(at),
  });

  useEffect(() => {
    const offLeft = left.offset.on('change', (offset) => {
      if (moving.current === -1) track.x.set(base.current - offset);
    });
    const offRight = right.offset.on('change', (offset) => {
      if (moving.current === 1) track.x.set(base.current + offset);
    });
    return () => {
      offLeft();
      offRight();
    };
  }, [left.offset, right.offset, track.x]);

  return null;
}

/** The tabs' panels side by side, the one open in view and setting the height. */
export function Panels<Tab extends string>({
  track,
  shown,
  open,
  panel,
}: {
  readonly track: Track<Tab>;
  readonly shown: ReadonlyArray<Tab>;
  readonly open: Tab;
  /** What a tab holds; `active` while it is open, `visible` while it can be seen. */
  readonly panel: (tab: Tab, active: boolean, visible: boolean) => ReactNode;
}) {
  const at = Math.max(0, shown.indexOf(open));
  // The tab open draws first; the ones beside once the page is idle, so a
  // swipe has them to show without slowing the first paint.
  const [drawn, setDrawn] = useState<ReadonlySet<Tab>>(() => new Set([open]));
  useEffect(() => {
    setDrawn((was) => (was.has(open) ? was : new Set([...was, open])));
  }, [open]);
  useEffect(() => {
    const all = () => setDrawn(new Set(shown));
    if (typeof requestIdleCallback === 'undefined') {
      const timer = setTimeout(all, 300);
      return () => clearTimeout(timer);
    }
    const idle = requestIdleCallback(all, { timeout: 1500 });
    return () => cancelIdleCallback(idle);
  }, [shown]);
  return (
    <GestureZone
      ref={track.zone as RefObject<HTMLDivElement>}
      style={{ touchAction: 'pan-y' }}
      className="-mx-4 overflow-clip sm:mx-0"
    >
      <Follow track={track} shown={shown} open={open} />
      <motion.div style={{ x: track.x }} className="relative">
        {shown.map((tab, index) => {
          const active = tab === open;
          return (
            <div
              key={tab}
              inert={!active}
              data-panel={tab}
              className={
                active
                  ? 'relative px-4 sm:px-0'
                  : `absolute top-0 w-full px-4 sm:px-0 ${track.moving ? '' : 'invisible [content-visibility:hidden]'}`
              }
              style={
                active
                  ? undefined
                  : {
                      left: `${(index - at) * 100}%`,
                      transform: `translateY(${track.peek.get(tab) ?? 0}px)`,
                    }
              }
            >
              {(active || drawn.has(tab)) &&
                panel(tab, active, active || track.moving)}
            </div>
          );
        })}
      </motion.div>
    </GestureZone>
  );
}
