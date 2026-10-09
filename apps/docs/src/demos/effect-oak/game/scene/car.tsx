import type { Ref } from 'react';
import type { RoadShape } from './geometry.js';

/** Yours drives up the road in blue; oncoming cars drive down in red. */
const TONES = {
  yours: {
    body: 'fill-sky-500',
    roof: 'fill-sky-600',
    trim: 'fill-sky-700',
    crease: 'fill-sky-400/50',
    glass: 'fill-sky-950/80',
  },
  oncoming: {
    body: 'fill-rose-500',
    roof: 'fill-rose-600',
    trim: 'fill-rose-700',
    crease: 'fill-rose-400/50',
    glass: 'fill-rose-950/80',
  },
} as const;

/**
 * A car seen from above, at the origin; the Scene moves it. Drawn in its own
 * box, `width` by `length`, nose up for yours and nose down for oncoming ones.
 */
export const Car = ({
  road,
  tone,
  ref,
}: {
  readonly road: RoadShape;
  readonly tone: keyof typeof TONES;
  readonly ref: Ref<SVGGElement>;
}) => {
  const { width: w, length: l } = road.car;
  const color = TONES[tone];
  return (
    <g ref={ref}>
      <g
        transform={
          tone === 'oncoming' ? `rotate(180 ${w / 2} ${l / 2})` : undefined
        }
      >
        {/* mirrors */}
        <rect
          x={-3}
          y={l * 0.3}
          width={5}
          height={7}
          rx={2}
          className={color.trim}
        />
        <rect
          x={w - 2}
          y={l * 0.3}
          width={5}
          height={7}
          rx={2}
          className={color.trim}
        />
        {/* body and bonnet */}
        <rect width={w} height={l} rx={w * 0.3} className={color.body} />
        <rect
          x={w * 0.25}
          y={l * 0.06}
          width={w * 0.5}
          height={l * 0.16}
          rx={w * 0.12}
          className={color.crease}
        />
        {/* windscreen, roof, rear window */}
        <path
          d={`M ${w * 0.16} ${l * 0.38} L ${w * 0.22} ${l * 0.26} H ${w * 0.78} L ${w * 0.84} ${l * 0.38} Z`}
          className={color.glass}
        />
        <rect
          x={w * 0.16}
          y={l * 0.4}
          width={w * 0.68}
          height={l * 0.3}
          rx={4}
          className={color.roof}
        />
        <path
          d={`M ${w * 0.16} ${l * 0.72} H ${w * 0.84} L ${w * 0.78} ${l * 0.82} H ${w * 0.22} Z`}
          className={color.glass}
        />
        {/* headlights and tail lights */}
        <rect
          x={w * 0.1}
          y={1.5}
          width={w * 0.22}
          height={3}
          rx={1.5}
          className="fill-amber-100"
        />
        <rect
          x={w * 0.68}
          y={1.5}
          width={w * 0.22}
          height={3}
          rx={1.5}
          className="fill-amber-100"
        />
        <rect
          x={w * 0.1}
          y={l - 4}
          width={w * 0.2}
          height={2.5}
          rx={1.25}
          className="fill-red-400"
        />
        <rect
          x={w * 0.7}
          y={l - 4}
          width={w * 0.2}
          height={2.5}
          rx={1.25}
          className="fill-red-400"
        />
      </g>
    </g>
  );
};
