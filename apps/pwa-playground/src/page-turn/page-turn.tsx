/*
 * Why the page coming in is not the live page during a drag.
 *
 * The router renders only the matched route, and pages read their data
 * through it, so a page the finger drags in cannot run until the router
 * navigates. Native stacks (UIKit, Ionic, Stackflow) keep both pages mounted
 * and change the URL on release, but only for swiping back to a page still in
 * the stack; none drags in a page that is not mounted. Rendering the target
 * beside the current page would mean a second router or reaching into this
 * one, so a Page Turn shows a Placeholder Page and changes the URL on release.
 *
 * React's `startGestureTransition` (experimental as of React 19.3, formerly
 * `useSwipeTransition`) is the intended fix: the destination is an optimistic
 * render the gesture scrubs through, cancelled or committed on release. Move
 * to it once it is stable and TanStack Router works with it.
 * https://github.com/facebook/react/pull/32785
 */

import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import {
  type AnimationPlaybackControls,
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { opposite, pageAt, placeholderAt, type Side } from './geometry.ts';
import { rememberTurn, transitionTypes } from './history.ts';
import { useTurnInputs } from './inputs.ts';
import { createLoads, type Load } from './loads.ts';
import { TURN_CSS } from './styles.ts';
import { useTurnSwipes } from './swipes.ts';

/** A turn that waits longer than this for its page has failed. */
const TIMEOUT = 8000;
const SPRING = { type: 'spring', stiffness: 380, damping: 40 } as const;
/** How dark a page gets, at most, as it sinks behind another in the dark theme. */
const SINK_SHADE = 0.6;

type Neighbours = { readonly prev?: string; readonly next?: string };

/**
 * Where a Page Turn stands. `dragging` follows a finger from `from` (the
 * progress it caught the pages at), toward `side` or, when `returning`, back
 * the other way. `turning` and `settling` animate in and out, and a finger
 * can catch either; `waiting` has the Placeholder Page in place until the
 * target loads; `landing` has asked the router for it.
 */
type Turn =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'dragging';
      readonly side: Side;
      readonly to: string;
      readonly returning: boolean;
      readonly from: number;
    }
  | {
      readonly phase: 'turning' | 'waiting' | 'settling' | 'landing';
      readonly side: Side;
      readonly to: string;
    };

const IDLE: Turn = { phase: 'idle' };

type PageTurnContext = {
  readonly turn: Turn;
  readonly load: Load;
  /** 0 at rest, 1 with the Placeholder Page in place of the page. */
  readonly progress: MotionValue<number>;
  /** 1 toward the next page, -1 toward the previous one. */
  readonly way: MotionValue<number>;
  readonly width: MotionValue<number>;
  /** Over the landed page, fading out: the Placeholder Page becoming it. */
  readonly veil: MotionValue<number>;
  readonly willTurn: MotionValue<boolean>;
  readonly register: (neighbours: Neighbours) => () => void;
  readonly go: (side: Side) => boolean;
  readonly retry: () => void;
};

const Context = createContext<PageTurnContext | null>(null);

const usePageTurnContext = () => {
  const context = useContext(Context);
  if (context === null) {
    throw new Error('Page Turn hooks need a PageTurnProvider around them.');
  }
  return context;
};

/**
 * The router's `defaultViewTransition`: history moves over a Page Turn's
 * entries replay it, everything else crossfades the Turn Surface's page.
 */
export const pageTurnTransition = { types: transitionTypes };

/**
 * Runs Page Turns for everything inside it: the Swipes, the arrow keys and
 * clicks on links to the current page's neighbours, and the loads behind them.
 * `swipe` turns the Swipes on and says how wide a strip at the left edge
 * belongs to something else. `load` wraps each target's load, such as to slow
 * it down for testing; it runs the router's preload by default.
 */
export function PageTurnProvider(props: {
  readonly children: ReactNode;
  readonly swipe?: { readonly enabled: boolean; readonly edge?: number };
  readonly load?: (to: string, preload: () => Promise<void>) => Promise<void>;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [neighbours, setNeighbours] = useState<Neighbours>({});
  const [turn, setTurnState] = useState<Turn>(IDLE);
  const current = useRef<Turn>(IDLE);
  const progress = useMotionValue(0);
  const way = useMotionValue(1);
  const width = useMotionValue(0);
  const veil = useMotionValue(0);
  const willTurn = useMotionValue(false);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  const [, loaded] = useReducer((n: number) => n + 1, 0);
  const [loads] = useState(() => createLoads(TIMEOUT, loaded));
  const latest = useRef({ neighbours, load: props.load });
  latest.current = { neighbours, load: props.load };

  const setTurn = (next: Turn) => {
    current.current = next;
    if (next.phase !== 'dragging') willTurn.set(false);
    setTurnState(next);
  };

  const startLoad = (to: string) =>
    loads.ensure(to, () => {
      const preload = () => router.preloadRoute({ to }).then(() => undefined);
      const wrap = latest.current.load;
      return wrap === undefined ? preload() : wrap(to, preload);
    });

  const moveTo = (target: 0 | 1, velocity: number, then: Turn) => {
    animation.current?.stop();
    animation.current = animate(progress, target, {
      ...SPRING,
      velocity,
      onComplete: () => {
        if (
          current.current.phase === 'turning' ||
          current.current.phase === 'settling'
        ) {
          setTurn(then);
        }
      },
    });
  };

  // In: the Placeholder Page takes the page's place, and waits there.
  const turnIn = (side: Side, to: string, velocity = 0) => {
    setTurn({ phase: 'turning', side, to });
    moveTo(1, velocity, { phase: 'waiting', side, to });
  };

  // Out: the page comes back and the turn is dropped; its load runs on.
  const turnOut = (side: Side, to: string, velocity = 0) => {
    setTurn({ phase: 'settling', side, to });
    moveTo(0, velocity, IDLE);
  };

  // A new turn toward `side`, if the page has a neighbour there.
  const begin = (side: Side): string | undefined => {
    const to = latest.current.neighbours[side];
    if (to === undefined) return undefined;
    animation.current?.stop();
    way.set(side === 'next' ? 1 : -1);
    startLoad(to);
    return to;
  };

  const go = useCallback((side: Side): boolean => {
    const now = current.current;
    if (now.phase === 'idle') {
      const to = begin(side);
      if (to === undefined) return false;
      turnIn(side, to);
      return true;
    }
    if (
      (now.phase === 'turning' || now.phase === 'waiting') &&
      now.side === opposite(side)
    ) {
      turnOut(now.side, now.to);
      return true;
    }
    return false;
  }, []);

  useTurnSwipes({
    enabled: props.swipe?.enabled ?? true,
    edge: props.swipe?.edge ?? 0,
    // A finger moving toward `side` starts a turn there or catches one
    // settling back; moving the other way takes back one on its way in.
    can: (side) =>
      (turn.phase === 'idle' && neighbours[side] !== undefined) ||
      (turn.phase === 'settling' && turn.side === side) ||
      ((turn.phase === 'turning' || turn.phase === 'waiting') &&
        turn.side === opposite(side)),
    onStart: (side) => {
      const now = current.current;
      if (now.phase === 'idle') {
        const to = begin(side);
        if (to === undefined) return false;
        setTurn({ phase: 'dragging', side, to, returning: false, from: 0 });
        return true;
      }
      const catching = now.phase === 'settling' && now.side === side;
      const takingBack =
        (now.phase === 'turning' || now.phase === 'waiting') &&
        now.side === opposite(side);
      if (!catching && !takingBack) return false;
      animation.current?.stop();
      setTurn({
        phase: 'dragging',
        side: now.side,
        to: now.to,
        returning: takingBack,
        from: progress.get(),
      });
      return true;
    },
    onMove: (_, offset) => {
      const now = current.current;
      if (now.phase !== 'dragging') return;
      const along = offset / (width.get() || innerWidth);
      const at = now.returning ? now.from - along : now.from + along;
      progress.set(Math.min(Math.max(at, 0), 1));
    },
    onWillTurn: (will) => willTurn.set(will),
    onEnd: (_, finished, velocity) => {
      const now = current.current;
      if (now.phase !== 'dragging') return;
      const speed = velocity / (width.get() || innerWidth);
      const turning = now.returning ? !finished : finished;
      if (turning) turnIn(now.side, now.to, now.returning ? -speed : speed);
      else turnOut(now.side, now.to, now.returning ? -speed : speed);
    },
  });

  const readNeighbours = useCallback(() => latest.current.neighbours, []);
  useTurnInputs(readNeighbours, go);

  // Waiting and loaded: land on the page, with no view transition of its own.
  const load = turn.phase === 'idle' ? 'idle' : loads.status(turn.to);
  useEffect(() => {
    if (turn.phase !== 'waiting' || load !== 'ready') return;
    setTurn({ phase: 'landing', side: turn.side, to: turn.to });
    void navigate({
      to: turn.to,
      viewTransition: false,
      state: rememberTurn(turn.side),
    });
  }, [turn, load]);

  // Any route change ends the turn. The one it landed on is revealed through
  // the veil; one from elsewhere, such as the Back button, simply wins.
  const shownPath = useRef(pathname);
  useLayoutEffect(() => {
    if (pathname === shownPath.current) return;
    shownPath.current = pathname;
    const now = current.current;
    animation.current?.stop();
    progress.jump(0);
    if (now.phase === 'landing' && now.to === pathname) {
      veil.jump(1);
      animate(veil, 0, { duration: 0.2, ease: 'easeOut' });
    }
    setTurn(IDLE);
  }, [pathname]);

  const register = useCallback((mine: Neighbours) => {
    setNeighbours(mine);
    return () => setNeighbours((now) => (now === mine ? {} : now));
  }, []);

  const retry = useCallback(() => {
    const now = current.current;
    if (now.phase !== 'idle') startLoad(now.to);
  }, []);

  return (
    <Context
      value={{
        turn,
        load,
        progress,
        way,
        width,
        veil,
        willTurn,
        register,
        go,
        retry,
      }}
    >
      <style>{TURN_CSS}</style>
      {props.children}
    </Context>
  );
}

/**
 * What a page declares: the pages before and after it. A Swipe, an arrow key
 * or a click on a link to either turns the page there. Returns the same
 * turns, for buttons. `enabled: false` declares none.
 */
export function usePageTurn(options: {
  readonly prev?: string | undefined;
  readonly next?: string | undefined;
  readonly enabled?: boolean;
}) {
  const { register, go } = usePageTurnContext();
  const { prev, next } = options;
  const enabled = options.enabled !== false;
  useEffect(
    () => register(enabled ? { prev, next } : {}),
    [register, enabled, prev, next],
  );
  return {
    prev: () => go('prev'),
    next: () => go('next'),
  };
}

/** The Page Turn under way, for UI that shows it. */
export function usePageTurnState() {
  const { turn, load, progress, willTurn, retry } = usePageTurnContext();
  return {
    phase: turn.phase,
    side: turn.phase === 'idle' ? undefined : turn.side,
    to: turn.phase === 'idle' ? undefined : turn.to,
    load,
    /** 0 → 1 as the Placeholder Page takes the page's place. */
    progress,
    /** Whether letting go now finishes the move under way. */
    willTurn,
    retry,
  };
}

function Shade(props: { readonly opacity: MotionValue<number> }) {
  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity: props.opacity }}
      className="pointer-events-none absolute inset-0 dark:bg-black"
    />
  );
}

/**
 * The part of the screen a Page Turn moves: the page inside it, and the
 * Placeholder Page that comes in beside it. Everything outside holds still.
 * `placeholder` draws what the Placeholder Page shows while its page loads.
 */
export function TurnSurface(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly placeholder?: (state: {
    readonly load: Load;
    readonly retry: () => void;
  }) => ReactNode;
}) {
  const { turn, load, progress, way, width, veil, retry } =
    usePageTurnContext();
  const surface = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = surface.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => width.set(element.clientWidth));
    observer.observe(element);
    width.set(element.clientWidth);
    return () => observer.disconnect();
  }, [width]);

  const sideNow = () => (way.get() > 0 ? 'next' : 'prev');
  const pageX = useTransform(
    () => pageAt(sideNow(), progress.get()).x * width.get(),
  );
  const pageScale = useTransform(() => pageAt(sideNow(), progress.get()).scale);
  const placeholderX = useTransform(
    () => placeholderAt(sideNow(), progress.get()).x * width.get(),
  );
  const placeholderScale = useTransform(
    () => placeholderAt(sideNow(), progress.get()).scale,
  );
  const veilShown = useTransform(veil, (v) => (v > 0 ? 'visible' : 'hidden'));
  // The page further from you dims as it sinks: invisible in light, where a
  // shadow already shows depth, and strong in dark, where a shadow cannot.
  const pageShade = useTransform(() =>
    sideNow() === 'next' ? progress.get() * SINK_SHADE : 0,
  );
  const placeholderShade = useTransform(() =>
    sideNow() === 'prev' ? (1 - progress.get()) * SINK_SHADE : 0,
  );

  const busy = turn.phase !== 'idle';
  // The page is off screen, or on its way off, once a turn is let go.
  const away = busy && turn.phase !== 'dragging' && turn.phase !== 'settling';
  // The next page comes in above; the previous one waits below.
  const placeholderOnTop = busy && turn.side === 'next';

  return (
    <div
      ref={surface}
      data-slot="turn-surface"
      className={cn('relative overflow-clip', props.className)}
    >
      <motion.div
        inert={away}
        aria-hidden={away}
        style={{ x: pageX, scale: pageScale, viewTransitionName: 'page-turn' }}
        className={cn(
          'absolute inset-0 bg-background',
          busy && 'ring-1 ring-edge',
          busy && !placeholderOnTop && 'z-10 shadow-2xl',
        )}
      >
        {props.children}
        <Shade opacity={pageShade} />
      </motion.div>
      <motion.div
        aria-hidden={!busy}
        role={busy ? 'status' : undefined}
        aria-label={busy ? 'Loading the page' : undefined}
        style={{
          x: placeholderX,
          scale: placeholderScale,
          visibility: busy ? 'visible' : 'hidden',
        }}
        className={cn(
          'absolute inset-0 bg-background ring-1 ring-edge',
          placeholderOnTop && 'z-10 shadow-2xl',
        )}
      >
        {busy ? props.placeholder?.({ load, retry }) : null}
        <Shade opacity={placeholderShade} />
      </motion.div>
      <motion.div
        aria-hidden="true"
        style={{ opacity: veil, visibility: veilShown }}
        className="pointer-events-none absolute inset-0 z-20 bg-background"
      />
    </div>
  );
}
