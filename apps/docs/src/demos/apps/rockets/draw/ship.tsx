import { useId } from 'react';
import { motion } from 'motion/react';

/*
 * The rocket, drawn in the theme's ink on its paper: hairline outlines, a
 * solid nose, and fuel as the one colour, filling the body from the bottom.
 * The viewBox ends at the nozzle; the flame hangs below it, outside the box.
 */

export const FUEL = 'oklch(0.78 0.15 65)';

/** How tall a rocket is drawn, in the site's units. */
export const HEIGHT = 140;
const WIDTH = (HEIGHT * 60) / 110;

const SHIP = {
  body: 'M30 4 C40 16 44 30 44 46 V100 H16 V46 C16 30 20 16 30 4 Z',
  nose: 'M30 4 C37 12 41 22 42.5 32 H17.5 C19 22 23 12 30 4 Z',
  fins: ['M16 72 L5 98 V110 L16 103 Z', 'M44 72 L55 98 V110 L44 103 Z'],
  nozzle: 'M22 100 H38 L36 108 H24 Z',
  flame: 'M24 108 C23 124 27 138 30 156 C33 138 37 124 36 108 Z',
};

const BOOSTER = {
  body: 'M7 2 C11 8 12 14 12 20 V52 H2 V20 C2 14 3 8 7 2 Z',
  nozzle: 'M3.5 52 H10.5 L9.5 57 H4.5 Z',
  flame: 'M4.5 57 C4 66 6 74 7 82 C8 74 10 66 9.5 57 Z',
};

const ink = {
  fill: 'var(--background)',
  stroke: 'var(--foreground)',
  strokeWidth: 1.25,
  strokeLinejoin: 'round' as const,
};

const STRAPPED = { x: 0, y: 0, rotate: 0, opacity: 1 };

/** Strapped to one side; once spent, it falls away from it as it mounts. */
const Booster = ({
  side,
  firing,
  falling,
}: {
  side: -1 | 1;
  firing: boolean;
  falling: boolean;
}) => (
  <motion.g
    initial={falling ? STRAPPED : false}
    animate={
      falling
        ? { x: side * 30, y: 110, rotate: side * 30, opacity: 0 }
        : STRAPPED
    }
    transition={{ duration: 1.3, ease: [0.4, 0, 0.9, 0.6] }}
    style={{ transformOrigin: `${30 + side * 20}px 80px` }}
  >
    <g transform={`translate(${side < 0 ? 0 : 46} 48)`} {...ink}>
      {firing && <path d={BOOSTER.flame} fill="none" />}
      <path d={BOOSTER.nozzle} />
      <path d={BOOSTER.body} />
    </g>
  </motion.g>
);

export type Boosters = 'strapped' | 'firing' | 'falling' | 'none';

/** One rocket, standing on its nozzle at the bottom of its box. */
export const Drawing = ({
  fuel,
  firing = false,
  boosters = 'none',
}: {
  fuel: number;
  firing?: boolean;
  boosters?: Boosters;
}) => {
  const clip = useId();
  return (
    <svg
      viewBox="0 0 60 110"
      overflow="visible"
      style={{ height: HEIGHT, width: WIDTH, display: 'block' }}
    >
      <defs>
        <clipPath id={clip}>
          <path d={SHIP.body} />
        </clipPath>
      </defs>
      {boosters !== 'none' &&
        ([-1, 1] as const).map((side) => (
          <Booster
            key={side}
            side={side}
            firing={boosters === 'firing'}
            falling={boosters === 'falling'}
          />
        ))}
      <g {...ink}>
        {firing && (
          <motion.path
            d={SHIP.flame}
            fill="none"
            animate={{ scaleY: [1, 0.8, 1] }}
            transition={{ duration: 0.24, repeat: Infinity }}
            style={{ transformOrigin: '30px 108px' }}
          />
        )}
        {SHIP.fins.map((fin) => (
          <path key={fin} d={fin} />
        ))}
        <path d={SHIP.nozzle} />
        <path d={SHIP.body} />
      </g>
      <g clipPath={`url(#${clip})`}>
        <motion.rect
          x={0}
          width={60}
          fill={FUEL}
          initial={false}
          animate={{ y: 100 - (96 * fuel) / 100, height: (96 * fuel) / 100 }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </g>
      <g {...ink}>
        <path d={SHIP.body} fill="none" />
        <path d={SHIP.nose} fill="var(--foreground)" />
        <circle cx={30} cy={56} r={6} />
      </g>
    </svg>
  );
};

/** What is left after a failed landing: the body on its side, the nose apart. */
export const Wreck = () => (
  <svg
    viewBox="0 0 60 110"
    overflow="visible"
    style={{ height: HEIGHT, width: WIDTH, display: 'block' }}
  >
    <motion.g
      {...ink}
      strokeDasharray="3 2"
      initial={{ rotate: 0 }}
      animate={{ rotate: 78 }}
      transition={{ duration: 0.7, ease: [0.5, 0, 0.9, 0.5] }}
      style={{ transformOrigin: '44px 110px' }}
    >
      {SHIP.fins.map((fin) => (
        <path key={fin} d={fin} />
      ))}
      <path d="M44 46 V100 H16 V46 C16 40 17 36 18 32 H42 C43 36 44 40 44 46 Z" />
    </motion.g>
    <motion.g
      {...ink}
      initial={{ x: 0, y: 0, rotate: 0 }}
      animate={{ x: -38, y: 74, rotate: -130 }}
      transition={{ duration: 0.9, ease: [0.3, 0, 0.7, 1] }}
      style={{ transformOrigin: '30px 20px' }}
    >
      <path d={SHIP.nose} fill="var(--foreground)" />
    </motion.g>
  </svg>
);
