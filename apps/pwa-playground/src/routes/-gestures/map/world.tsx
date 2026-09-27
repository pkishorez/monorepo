/**
 * The map: a made-up town drawn in SVG from kui's tokens, so the lab needs
 * no tiles or network. `layer` picks how the ground is textured.
 */

import { AnimatePresence, motion, useReducedMotion } from 'kui-toolkit/motion';

export const WORLD_PX = 1200;

export const LAYERS = ['Dots', 'Grid', 'Plain'] as const;
export type Layer = (typeof LAYERS)[number];

const tint = (name: string, alpha: number) =>
  `color-mix(in oklch, var(--${name}) ${alpha * 100}%, transparent)`;

function Ground(props: { readonly layer: Layer }) {
  const reducedMotion = useReducedMotion();
  return (
    <>
      <defs>
        <pattern
          id="map-dots"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="12"
            cy="12"
            r="1.6"
            fill={tint('muted-foreground', 0.5)}
          />
        </pattern>
        <pattern
          id="map-grid"
          width="48"
          height="48"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M48 0H0V48"
            fill="none"
            stroke={tint('muted-foreground', 0.3)}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width={WORLD_PX} height={WORLD_PX} fill="var(--muted)" />
      <AnimatePresence initial={false}>
        {props.layer === 'Plain' ? null : (
          <motion.rect
            key={props.layer}
            width={WORLD_PX}
            height={WORLD_PX}
            fill={props.layer === 'Dots' ? 'url(#map-dots)' : 'url(#map-grid)'}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: { duration: reducedMotion ? 0 : 0.14 },
            }}
            transition={{
              duration: reducedMotion ? 0 : 0.18,
              ease: [0.32, 0.72, 0, 1],
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const ROADS = [
  'M0 300 C300 280 500 360 1200 320',
  'M0 820 C400 860 700 760 1200 800',
  'M380 0 C360 400 420 800 360 1200',
  'M860 0 C900 300 820 900 880 1200',
];

/** The town: a lake, two parks, blocks and roads, on the chosen ground. */
export function World(props: { readonly layer: Layer }) {
  return (
    <svg
      aria-hidden="true"
      width={WORLD_PX}
      height={WORLD_PX}
      viewBox={`0 0 ${WORLD_PX} ${WORLD_PX}`}
      className="absolute top-0 left-0"
    >
      <Ground layer={props.layer} />
      <path
        d="M620 420 C760 380 900 470 860 590 C820 700 640 700 580 610 C530 530 540 450 620 420Z"
        fill={tint('chart-6', 0.35)}
      />
      <rect
        x="120"
        y="440"
        width="180"
        height="260"
        rx="24"
        fill={tint('positive', 0.3)}
      />
      <rect
        x="960"
        y="880"
        width="200"
        height="220"
        rx="24"
        fill={tint('positive', 0.3)}
      />
      {[
        [460, 120, 120, 120],
        [620, 120, 180, 110],
        [120, 900, 160, 180],
        [460, 900, 280, 140],
        [980, 420, 160, 160],
      ].map(([x, y, width, height]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={width}
          height={height}
          rx="8"
          fill={tint('chart-7', 0.25)}
        />
      ))}
      {ROADS.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--background)"
          strokeWidth="18"
          strokeLinecap="round"
        />
      ))}
      {ROADS.map((d) => (
        <path
          key={`${d}-line`}
          d={d}
          fill="none"
          stroke={tint('muted-foreground', 0.35)}
          strokeWidth="2"
          strokeDasharray="10 12"
        />
      ))}
    </svg>
  );
}
