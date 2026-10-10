import { useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import type { ReactNode } from 'react';
import type { RoadShape } from './geometry.js';
import { Car } from './car.js';
import { carAt, dividerShift, roadWidth } from './geometry.js';
import { Road } from './road.js';
import { lapTime, Stopwatch } from './stopwatch.js';

/*
 * The pieces a game View is drawn with. Nothing here knows the game: the
 * Scene draws any road it is given, and moves it at each Frame.
 */

/** Where things are at one Frame, in road units. */
type Where = {
  /** How long you have been driving, in milliseconds. */
  readonly driving: number;
  /** How far you have driven. */
  readonly driven: number;
  /** Which lane your car is in; between two while changing lanes. */
  readonly lane: number;
  /** Oncoming cars: their lane, and how far in front of yours. */
  readonly cars: ReadonlyArray<{
    readonly lane: number;
    readonly ahead: number;
  }>;
};

/** Oncoming cars drawn at most at once; more than fit on the road. */
const POOL = 8;

/**
 * The road seen from above, as SVG. React draws it once per Model; at each
 * Frame `where` says where things are, and motion values move them with no
 * render. `children` are laid over it.
 *
 * On a wide screen the whole road shows, as tall as there is room for. On a
 * narrow one it fills the width, and the far end of the road is cut off.
 */
export const Scene = ({
  road,
  frame,
  where,
  children,
}: {
  readonly road: RoadShape;
  readonly frame: MotionValue<number>;
  readonly where: (at: number) => Where;
  readonly children?: ReactNode;
}) => {
  const now = useTransform(frame, where);
  const shift = useTransform(now, ({ driven }) => dividerShift(road, driven));
  const yourX = useTransform(now, ({ lane }) => carAt(road, lane).x);
  const yourY = carAt(road, 0).y;
  const time = useTransform(now, ({ driving }) => lapTime(driving));

  return (
    <div
      className="relative h-full w-full sm:w-auto sm:max-w-full"
      style={{ aspectRatio: `${roadWidth(road)} / ${road.roadLength}` }}
    >
      <svg
        viewBox={`0 0 ${roadWidth(road)} ${road.roadLength}`}
        preserveAspectRatio="xMidYMax slice"
        className="block size-full bg-neutral-800 sm:rounded-lg"
        role="img"
        aria-label="A road seen from above"
      >
        <Road road={road} shift={shift} />
        {Array.from({ length: POOL }, (_, index) => (
          <Oncoming
            key={index}
            road={road}
            now={now}
            index={index}
            yourY={yourY}
          />
        ))}
        <Car road={road} tone="yours" x={yourX} y={yourY} />
      </svg>
      <Stopwatch time={time} />
      {children}
    </div>
  );
};

/** One car of the pool: the `index`th oncoming car, hidden while there is none. */
const Oncoming = ({
  road,
  now,
  index,
  yourY,
}: {
  readonly road: RoadShape;
  readonly now: MotionValue<Where>;
  readonly index: number;
  readonly yourY: number;
}) => {
  const car = useTransform(now, ({ cars }) => cars[index]);
  return (
    <Car
      road={road}
      tone="oncoming"
      x={useTransform(car, (c) => (c ? carAt(road, c.lane).x : 0))}
      y={useTransform(car, (c) => (c ? yourY - c.ahead : 0))}
      visibility={useTransform(car, (c) => (c ? 'visible' : 'hidden'))}
    />
  );
};

export { CrashBanner } from './crash-banner.js';
export { PausedOverlay } from './paused-overlay.js';
export { StartOverlay } from './start-overlay.js';
export { useKeys, useSteering } from './steering.js';
export { lapTime };
