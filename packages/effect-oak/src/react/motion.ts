import { use, useSyncExternalStore } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { AppContext } from './view.tsx';
import type { DrawnApp } from './view.tsx';

/*
 * The Frame: the Time the app is drawn at, as a motion value, for drawing
 * what follows from the Model and Time alone: how long ago, how far along.
 * Live and running, it moves at every animation frame; stopped, or showing
 * a Step, it stands at that Time, so a View of the past draws exactly what
 * it drew then.
 *
 * It is only for that. Animating from one Snapshot to the next is React's,
 * and a fact always arrives as a Message.
 *
 * One Frame per app, however many Views use it. It moves only while a View
 * that uses it is on the page.
 */

interface Frame {
  readonly value: MotionValue<number>;
  readonly watch: () => () => void;
}

const frames = new WeakMap<DrawnApp, Frame>();

const frameOf = (app: DrawnApp): Frame => {
  const known = frames.get(app);
  if (known) return known;
  const value = motionValue(app.time().now);
  let watching = 0;
  let loop: number | undefined;

  /** Set the Frame to the Time drawn now, and keep it moving while it moves and is watched. */
  const follow = () => {
    const { now, moving } = app.time();
    value.set(now);
    if (moving && watching > 0 && loop === undefined)
      loop = requestAnimationFrame(() => {
        loop = undefined;
        follow();
      });
  };
  app.subscribe(follow);

  const frame: Frame = {
    value,
    watch: () => {
      watching++;
      follow();
      return () => {
        watching--;
      };
    },
  };
  frames.set(app, frame);
  return frame;
};

const still = () => 0;

/** The app's Frame. Turn it into motion with `useTransform`; reading it never renders. */
export const useFrame = (): MotionValue<number> => {
  const app = use(AppContext);
  if (!app) throw new Error('[effect-oak] useFrame is used outside an app');
  const frame = frameOf(app);
  // Subscribing is how a View says it is on the page: the Frame moves while one is.
  useSyncExternalStore(frame.watch, still, still);
  return frame.value;
};
