import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  useMotionValue,
} from '@kstackz/ui-toolkit/motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { Neighbours } from './direction.ts';
import { opposite, type Side } from './geometry.ts';
import { createLoads, type Load } from './loads.ts';
import { useTurnSwipes } from './swipes.ts';

/** A turn that waits longer than this for its page has failed. */
const TIMEOUT = 8000;
const SPRING = { type: 'spring', stiffness: 380, damping: 40 } as const;

/**
 * Where a Page Turn under a finger stands. `dragging` follows a finger from
 * `from` (the progress it caught the pages at), toward `side` or, when
 * `returning`, back the other way. `turning` and `settling` animate in and
 * out, and a finger can catch either; `waiting` has the Placeholder Page in
 * place until the target loads; `landing` has asked the router for it.
 */
export type Turn =
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

export type Controller = {
  readonly turn: Turn;
  readonly load: Load;
  /** 0 at rest, 1 with the Placeholder Page in place of the page. */
  readonly progress: MotionValue<number>;
  /** 1 toward the next page, -1 toward the previous one. */
  readonly way: MotionValue<number>;
  readonly width: MotionValue<number>;
  /** Over the page just landed on, fading out: the Placeholder Page becoming it. */
  readonly veil: MotionValue<number>;
  /** The page the veil stands in for. */
  readonly landed: string | undefined;
  readonly willTurn: MotionValue<boolean>;
  readonly retry: () => void;
};

/**
 * Page Turns under a finger: the Swipes that start, catch and take back a
 * turn, the load of its target, and landing on it once the turn is let go
 * and the page has loaded. The URL changes only then, so until it does the
 * page left is still the current one.
 */
export function useTurnController(options: {
  readonly neighbours: Neighbours;
  readonly swipe: { readonly enabled: boolean; readonly edge: number };
  readonly load:
    | ((to: string, preload: () => Promise<void>) => Promise<void>)
    | undefined;
}): Controller {
  const router = useRouter();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { neighbours } = options;

  const [turn, setTurnState] = useState<Turn>(IDLE);
  const current = useRef<Turn>(IDLE);
  const progress = useMotionValue(0);
  const way = useMotionValue(1);
  const width = useMotionValue(0);
  const veil = useMotionValue(0);
  const [landed, setLanded] = useState<string | undefined>(undefined);
  const willTurn = useMotionValue(false);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  const [, loaded] = useReducer((n: number) => n + 1, 0);
  const [loads] = useState(() => createLoads(TIMEOUT, loaded));
  const latest = useRef(options);
  latest.current = options;

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
        const phase = current.current.phase;
        if (phase === 'turning' || phase === 'settling') setTurn(then);
      },
    });
  };

  // In: the Placeholder Page takes the page's place, and waits there.
  const turnIn = (side: Side, to: string, velocity: number) => {
    setTurn({ phase: 'turning', side, to });
    moveTo(1, velocity, { phase: 'waiting', side, to });
  };

  // Out: the page comes back and the turn is dropped; its load runs on.
  const turnOut = (side: Side, to: string, velocity: number) => {
    setTurn({ phase: 'settling', side, to });
    moveTo(0, velocity, IDLE);
  };

  const widthNow = () => width.get() || innerWidth;

  useTurnSwipes({
    enabled: options.swipe.enabled,
    edge: options.swipe.edge,
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
        const to = latest.current.neighbours[side];
        if (to === undefined) return false;
        animation.current?.stop();
        way.set(side === 'next' ? 1 : -1);
        startLoad(to);
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
      const along = offset / widthNow();
      const at = now.returning ? now.from - along : now.from + along;
      progress.set(Math.min(Math.max(at, 0), 1));
    },
    onWillTurn: (will) => willTurn.set(will),
    onEnd: (_, finished, velocity) => {
      const now = current.current;
      if (now.phase !== 'dragging') return;
      const speed = (now.returning ? -velocity : velocity) / widthNow();
      const turning = now.returning ? !finished : finished;
      if (turning) turnIn(now.side, now.to, speed);
      else turnOut(now.side, now.to, speed);
    },
  });

  // Let go and loaded: land on the page. The pages are already where the
  // turn ends, so the router changes the URL with no transition of its own.
  const load = turn.phase === 'idle' ? 'idle' : loads.status(turn.to);
  useEffect(() => {
    if (turn.phase !== 'waiting' || load !== 'ready') return;
    setTurn({ phase: 'landing', side: turn.side, to: turn.to });
    void navigate({ to: turn.to, viewTransition: false });
  }, [turn, load]);

  // Any route change ends the turn. The page it landed on shows through the
  // Placeholder Page fading out; one from elsewhere, such as Back, just wins.
  const shownPath = useRef(pathname);
  useLayoutEffect(() => {
    if (pathname === shownPath.current) return;
    shownPath.current = pathname;
    const now = current.current;
    animation.current?.stop();
    progress.jump(0);
    if (now.phase === 'landing' && now.to === pathname) {
      setLanded(pathname);
      veil.jump(1);
      animate(veil, 0, {
        duration: 0.2,
        ease: 'easeOut',
        onComplete: () => setLanded(undefined),
      });
    }
    setTurn(IDLE);
  }, [pathname]);

  const retry = useCallback(() => {
    const now = current.current;
    if (now.phase !== 'idle') startLoad(now.to);
  }, []);

  return { turn, load, progress, way, width, veil, landed, willTurn, retry };
}
