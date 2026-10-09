import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { UseFrame } from 'effect-oak/react';
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
 * The road seen from above, as SVG. React draws it once; at each Frame it asks
 * `where` things are and moves them through refs. `children` are laid over it.
 *
 * On a wide screen the whole road shows, as tall as there is room for. On a
 * narrow one it fills the width, and the far end of the road is cut off.
 */
export const Scene = ({
  road,
  useFrame,
  where,
  children,
}: {
  readonly road: RoadShape;
  readonly useFrame: UseFrame;
  readonly where: (at: number) => Where;
  readonly children?: ReactNode;
}) => {
  const dividers = useRef<SVGGElement>(null);
  const yours = useRef<SVGGElement>(null);
  const oncoming = useRef<Array<SVGGElement | null>>([]);
  const stopwatch = useRef<HTMLSpanElement>(null);

  useFrame((at) => {
    const { driving, driven, lane, cars } = where(at);
    const you = carAt(road, lane);
    dividers.current?.setAttribute(
      'transform',
      `translate(0 ${dividerShift(road, driven)})`,
    );
    yours.current?.setAttribute('transform', `translate(${you.x} ${you.y})`);
    oncoming.current.forEach((element, index) => {
      const car = cars[index];
      if (!element) return;
      element.setAttribute('visibility', car ? 'visible' : 'hidden');
      if (!car) return;
      const { x } = carAt(road, car.lane);
      element.setAttribute('transform', `translate(${x} ${you.y - car.ahead})`);
    });
    if (stopwatch.current) stopwatch.current.textContent = lapTime(driving);
  });

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
        <Road road={road} dividers={dividers} />
        {Array.from({ length: POOL }, (_, index) => (
          <Car
            key={index}
            road={road}
            tone="oncoming"
            ref={(element) => {
              oncoming.current[index] = element;
            }}
          />
        ))}
        <Car road={road} tone="yours" ref={yours} />
      </svg>
      <Stopwatch ref={stopwatch} />
      {children}
    </div>
  );
};

export { CrashBanner } from './crash-banner.js';
export { StartOverlay } from './start-overlay.js';
export { useSteering } from './steering.js';
export { lapTime };
