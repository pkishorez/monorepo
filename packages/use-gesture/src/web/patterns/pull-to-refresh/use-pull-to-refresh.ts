import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useSwipe } from '../../recognizers/index.ts';

export type PullToRefreshOptions = {
  /** Runs once a pull is released armed; the indicator holds until it settles. */
  readonly onRefresh: () => Promise<unknown> | void;
  /** How far, in px, the indicator travels to be armed: 72 by default. */
  readonly distance?: number;
  /** Whether a Swipe down pulls: true by default. */
  readonly enabled?: boolean;
};

/**
 * `pulling` while fingers pull short of `distance`, `armed` past it, and
 * `refreshing` from an armed release until `onRefresh` settles.
 */
export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing';

export type PullToRefresh = {
  /** The indicator's offset in px, with resistance: it reaches `distance` at twice that pull. */
  readonly y: MotionValue<number>;
  /** 0 to 1 toward armed. */
  readonly progress: MotionValue<number>;
  readonly state: PullState;
};

const SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const;

/** Px of indicator for `offset` px of pull: slows as it goes, `limit` at most. */
export const resist = (offset: number, limit: number) =>
  (limit * offset) / (offset + limit);

/**
 * Pull to refresh: a Swipe down that the indicator follows with resistance,
 * refreshing when released past `distance`. It starts only where the list is
 * already at its top, since a list that can still scroll keeps the touch.
 */
export function usePullToRefresh(options: PullToRefreshOptions): PullToRefresh {
  const { distance = 72, enabled = true } = options;
  const limit = distance * 2;
  const y = useMotionValue(0);
  const progress = useTransform(y, [0, distance], [0, 1]);
  const [state, setState] = useState<PullState>('idle');
  const pulling = useRef(false);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);

  const to = (value: number) => {
    animation.current?.stop();
    animation.current = animate(y, value, SPRING);
  };

  const back = () => {
    pulling.current = false;
    to(0);
    setState('idle');
  };

  const swipe = useSwipe({
    enabled: enabled && state !== 'refreshing',
    direction: 'down',
    commit: { distance: limit },
    onStart: () => {
      animation.current?.stop();
      pulling.current = true;
      setState('pulling');
    },
    onCommit: () => {
      pulling.current = false;
      to(distance);
      setState('refreshing');
      void Promise.resolve().then(options.onRefresh).finally(back);
    },
    onCancel: () => {
      if (pulling.current) back();
    },
  });

  useEffect(() => {
    const offOffset = swipe.offset.on('change', (offset) => {
      if (pulling.current) y.set(resist(offset, limit));
    });
    const offArmed = swipe.willCommit.on('change', (armed) => {
      if (pulling.current) setState(armed ? 'armed' : 'pulling');
    });
    return () => {
      offOffset();
      offArmed();
    };
  });

  useEffect(() => () => animation.current?.stop(), []);

  return { y, progress, state };
}
