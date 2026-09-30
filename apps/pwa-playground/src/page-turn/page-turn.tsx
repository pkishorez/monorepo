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
import { useNavigate, useRouter } from '@tanstack/react-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type Controller, useTurnController } from './controller.ts';
import { type Neighbours, transitionTypes } from './direction.ts';
import type { Side } from './geometry.ts';
import { useTurnKeys } from './inputs.ts';
import { Pending } from './pending.tsx';
import { TURN_CSS } from './styles.ts';
import { Surface as SurfaceView } from './surface.tsx';

type Context = {
  readonly controller: Controller;
  readonly register: (neighbours: Neighbours) => () => void;
  readonly turn: (side: Side) => void;
};

/**
 * Page Turns for one app: pages declare the pages before and after them, and
 * a move between neighbours plays as one page leaving while the other comes in.
 *
 * - A finger drives it on the Turn Surface, with a Placeholder Page showing
 *   the target's own loading screen until the page has loaded; the URL
 *   changes as the turn lands, so until then it can be taken back.
 * - Everything else — a link, an arrow key, Back and Forward — is a normal
 *   navigation, and `viewTransition` has the router play the same motion as
 *   a view transition: toward the next page when the page left declared the
 *   one arrived at as its next, whichever way history moved, and so on.
 *   Anything else crossfades.
 *
 * Each page's neighbours are preloaded as it declares them, so a click or key
 * turns without waiting.
 */
export function createPageTurn() {
  // What the current page declared, for the router's view transitions.
  let declared: Neighbours = {};
  const TurnContext = createContext<Context | null>(null);

  const useTurnContext = () => {
    const context = useContext(TurnContext);
    if (context === null) {
      throw new Error('Page Turn hooks need its Provider around them.');
    }
    return context;
  };

  /**
   * Runs Page Turns for everything inside it. `swipe` turns the Swipes on and
   * says how wide a strip at the left edge belongs to something else. `load`
   * wraps each load a finger's turn waits for, such as to slow it down for
   * testing; it runs the router's preload by default.
   */
  function Provider(props: {
    readonly children: ReactNode;
    readonly swipe?: { readonly enabled: boolean; readonly edge?: number };
    readonly load?: (to: string, preload: () => Promise<void>) => Promise<void>;
  }) {
    const router = useRouter();
    const navigate = useNavigate();
    const [neighbours, setNeighbours] = useState<Neighbours>({});
    const latest = useRef(neighbours);
    latest.current = neighbours;

    const controller = useTurnController({
      neighbours,
      swipe: {
        enabled: props.swipe?.enabled ?? true,
        edge: props.swipe?.edge ?? 0,
      },
      load: props.load,
    });

    const register = useCallback(
      (mine: Neighbours) => {
        declared = mine;
        setNeighbours(mine);
        for (const to of [mine.prev, mine.next]) {
          if (to !== undefined)
            void router.preloadRoute({ to }).catch(() => {});
        }
        return () => {
          if (declared === mine) declared = {};
          setNeighbours((now) => (now === mine ? {} : now));
        };
      },
      [router],
    );

    // A plain navigation: the router plays the turn as a view transition.
    const turn = useCallback(
      (side: Side) => {
        const to = latest.current[side];
        if (to !== undefined) void navigate({ to });
      },
      [navigate],
    );
    useTurnKeys(turn);

    return (
      <TurnContext value={{ controller, register, turn }}>
        <style>{TURN_CSS}</style>
        {props.children}
      </TurnContext>
    );
  }

  /**
   * What a page declares: the pages before and after it. A Swipe, an arrow
   * key, a link or Back and Forward between them plays a Page Turn. Returns
   * the same turns, for buttons. `enabled: false` declares none. Inside a
   * loading screen drawn for another page it declares nothing.
   */
  function usePageTurn(options: {
    readonly prev?: string | undefined;
    readonly next?: string | undefined;
    readonly enabled?: boolean;
  }) {
    const { register, turn } = useTurnContext();
    const pending = useContext(Pending);
    const { prev, next } = options;
    const enabled = options.enabled !== false && !pending;
    useEffect(
      () => (enabled ? register({ prev, next }) : undefined),
      [register, enabled, prev, next],
    );
    return { prev: () => turn('prev'), next: () => turn('next') };
  }

  /** The Page Turn under a finger, for UI that shows it. */
  function usePageTurnState() {
    const { turn, load, progress, willTurn, retry } =
      useTurnContext().controller;
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

  /**
   * The part of the screen a Page Turn moves. `frame` sets a loading screen
   * in the page's padding, as the page itself is; `failed` shows in the
   * Placeholder Page when its page could not load.
   */
  function Surface(props: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly frame?: (page: ReactNode) => ReactNode;
    readonly failed?: (retry: () => void) => ReactNode;
  }) {
    const { controller } = useTurnContext();
    return <SurfaceView controller={controller} {...props} />;
  }

  return {
    Provider,
    Surface,
    usePageTurn,
    usePageTurnState,
    /** The router's `defaultViewTransition`. */
    viewTransition: {
      types: (change: Parameters<typeof transitionTypes>[0]) =>
        transitionTypes(change, declared),
    },
  };
}
