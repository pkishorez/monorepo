import { useRef } from 'react';
import type { UseFrame } from 'effect-oak/react';
import { FrameCanvas } from '../../frame-canvas/index.js';
import {
  fadeAt,
  paintPointer,
  paintSky,
  paintTrail,
  paintVignette,
} from './look.js';

/*
 * The field on a canvas. At each Frame it asks where every particle is and
 * paints it. Carrying a particle on is step by step, so the Sky remembers
 * how far it got for each particle and goes on from there; a particle it has
 * not seen, or a Frame earlier than it got to (Time Travel), starts over
 * from what the Model says.
 */

type Point = { readonly x: number; readonly y: number };

/** A particle as the Model has it, enough to carry it on and paint it. */
type Particle = {
  readonly id: number;
  readonly born: number;
  readonly from: number;
  readonly trail: ReadonlyArray<Point>;
  readonly seed: {
    readonly hue: number;
    readonly hueDrift: number;
    readonly lifespan: number;
  };
};

/** Where a particle got to: its place and past as of clock `from`. */
type Carried = {
  readonly from: number;
  readonly trail: ReadonlyArray<Point>;
  readonly gone: boolean;
};

export const Sky = <P extends Particle>({
  width,
  height,
  useFrame,
  particles,
  pointer,
  pointerRadius,
  clock,
  carry,
  onPress,
  onMove,
}: {
  readonly width: number;
  readonly height: number;
  readonly useFrame: UseFrame;
  readonly particles: ReadonlyArray<P>;
  readonly pointer: Point | null;
  readonly pointerRadius: number;
  /** What the field's clock reads at a Frame's Time. */
  readonly clock: (at: number) => number;
  /** Carry a particle on from where it got to, to a later clock. */
  readonly carry: (particle: P, carried: Carried, clock: number) => Carried;
  readonly onPress: (point: Point) => void;
  readonly onMove: (point: Point) => void;
}) => {
  const got = useRef(new Map<P, Carried>());

  /** Carry a particle on to clock `now`, from where the Sky last got it to if it can. */
  const carriedTo = (particle: P, now: number) => {
    const known = got.current.get(particle);
    return carry(
      particle,
      known && known.from <= now
        ? known
        : { from: particle.from, trail: particle.trail, gone: false },
      now,
    );
  };

  return (
    <FrameCanvas
      width={width}
      height={height}
      useFrame={useFrame}
      label="Particles drifting through a flow field"
      className="w-full max-w-[960px] cursor-crosshair rounded-2xl border border-white/10"
      onPress={onPress}
      onMove={onMove}
      draw={(context, at) => {
        const now = clock(at);
        paintSky(context, width, height, now / 1000);
        const next = new Map<P, Carried>();
        for (const particle of particles) {
          const carried = carriedTo(particle, now);
          next.set(particle, carried);
          if (carried.gone) continue;
          const age = now - particle.born;
          const hue =
            (((particle.seed.hue + (particle.seed.hueDrift * age) / 1000) %
              360) +
              360) %
            360;
          paintTrail(
            context,
            carried.trail,
            hue,
            fadeAt(age, particle.seed.lifespan),
          );
        }
        got.current = next;
        paintVignette(context, width, height);
        paintPointer(context, pointer, pointerRadius);
      }}
    />
  );
};
