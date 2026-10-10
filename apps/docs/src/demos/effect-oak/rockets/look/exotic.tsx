import { useId } from 'react';
import type { PointerEvent } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import type { MotionValue } from 'motion/react';
import { cn } from '@kstackz/web-platform/components/utils';
import { useCompact, useSky } from './context.js';
import type { Kit, Phase } from './kit.js';
import { Rig } from './rig.js';
import { BOOSTER, SHIP } from './shapes.js';

/*
 * Exotic: a night launch. A star field that shifts a little with the
 * pointer, frosted bays over it, metal rockets and a hot exhaust plume that
 * flickers. Every effect is a transform, an opacity or a fixed blur, so it
 * stays smooth; with reduced motion nothing flickers or drifts.
 */

const AMBER = 'oklch(0.83 0.15 75)';
const EMBER = 'oklch(0.68 0.2 42)';

const CSS = `
@keyframes rockets-flicker {
  0% { transform: scaleY(1) scaleX(1); opacity: 1; }
  33% { transform: scaleY(0.9) scaleX(1.04); opacity: 0.85; }
  66% { transform: scaleY(1.06) scaleX(0.97); opacity: 0.95; }
  100% { transform: scaleY(0.95) scaleX(1.02); opacity: 0.9; }
}
@keyframes rockets-flash {
  0%, 90%, 100% { opacity: 0; }
  91% { opacity: 0.55; }
  92.5% { opacity: 0.05; }
  94% { opacity: 0.35; }
}
@keyframes rockets-twinkle {
  from { opacity: 0.55; }
  to { opacity: 1; }
}
.rockets-flicker { animation: rockets-flicker 140ms steps(1, end) infinite alternate; transform-box: fill-box; transform-origin: 50% 0%; }
.rockets-flash { animation: rockets-flash 6s linear infinite; }
.rockets-twinkle { animation: rockets-twinkle 3.2s ease-in-out infinite alternate; }
@keyframes rockets-rain {
  from { transform: translateY(-39.34px); }
  to { transform: translateY(0); }
}
.rockets-rain { animation: rockets-rain 400ms linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .rockets-flicker, .rockets-flash, .rockets-twinkle, .rockets-rain { animation: none; }
}
`;

/** Dots of light scattered over a tile; `size` sets the tile, so each layer repeats differently. */
const stars = (
  size: number,
  dots: ReadonlyArray<readonly [number, number, number]>,
) => ({
  backgroundImage: dots
    .map(
      ([x, y, r]) =>
        `radial-gradient(${r}px ${r}px at ${x}% ${y}%, oklch(0.97 0.02 250 / 0.9), transparent)`,
    )
    .join(', '),
  backgroundSize: `${size}px ${size}px`,
});

const FAR = stars(170, [
  [12, 18, 1],
  [48, 62, 1],
  [80, 30, 1.2],
  [30, 88, 1],
  [66, 8, 1],
  [90, 76, 1],
]);
const NEAR = stars(290, [
  [20, 40, 1.6],
  [72, 70, 1.4],
  [55, 22, 1.8],
  [8, 82, 1.3],
]);

/** A star layer moved by the pointer, `depth` pixels at most. */
const Stars = ({
  pointer,
  depth,
  style,
  className,
}: {
  readonly pointer: {
    readonly x: MotionValue<number>;
    readonly y: MotionValue<number>;
  };
  readonly depth: number;
  readonly style: object;
  readonly className?: string;
}) => (
  <motion.div
    aria-hidden
    className={cn('pointer-events-none absolute -inset-8', className)}
    style={{
      ...style,
      x: useTransform(pointer.x, (x) => x * depth),
      y: useTransform(pointer.y, (y) => y * depth),
    }}
  />
);

const firing = (phase: Phase) => phase === 'flight' || phase === 'countdown';

/** The exhaust: a hot core over a soft glow, flickering. */
const Plume = ({
  path,
  small,
}: {
  readonly path: string;
  readonly small?: boolean;
}) => {
  const id = useId();
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.99 0.03 95)" />
          <stop offset="0.3" stopColor={AMBER} />
          <stop offset="0.7" stopColor={EMBER} stopOpacity="0.7" />
          <stop offset="1" stopColor={EMBER} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill={AMBER}
        opacity={0.45}
        style={{ filter: `blur(${small ? 2 : 5}px)` }}
        className="rockets-flicker"
      />
      <path d={path} fill={`url(#${id})`} className="rockets-flicker" />
    </g>
  );
};

/** Metal, shaded across like a cylinder. */
const Metal = ({ id }: { readonly id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stopColor="oklch(0.62 0.02 255)" />
    <stop offset="0.45" stopColor="oklch(0.96 0.01 250)" />
    <stop offset="1" stopColor="oklch(0.55 0.02 260)" />
  </linearGradient>
);

export const exotic: Kit = {
  transition: { type: 'spring', duration: 0.9, bounce: 0.3 },

  Stage: function Stage({ children }) {
    const storm = useSky() === 'storm';
    const still = useReducedMotion();
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const pointer = {
      x: useSpring(x, { stiffness: 60, damping: 20 }),
      y: useSpring(y, { stiffness: 60, damping: 20 }),
    };
    const follow = (event: PointerEvent<HTMLDivElement>) => {
      if (still) return;
      const box = event.currentTarget.getBoundingClientRect();
      x.set(((event.clientX - box.left) / box.width) * 2 - 1);
      y.set(((event.clientY - box.top) / box.height) * 2 - 1);
    };
    return (
      <div
        onPointerMove={follow}
        className="dark relative isolate flex size-full flex-col overflow-hidden rounded-2xl text-white/90"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, oklch(0.24 0.06 268), oklch(0.13 0.03 270) 70%)',
        }}
      >
        <style href="rockets-exotic" precedence="medium">
          {CSS}
        </style>
        <Stars pointer={pointer} depth={-6} style={FAR} />
        <Stars
          pointer={pointer}
          depth={-16}
          style={NEAR}
          className="rockets-twinkle"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 100%, oklch(0.55 0.12 50 / 0.22), transparent)',
          }}
        />
        {storm && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-10 -top-16 h-2/5 rounded-[50%] bg-[oklch(0.32_0.03_260/0.75)] blur-2xl"
            />
            <div
              aria-hidden
              className="rockets-rain pointer-events-none absolute -inset-y-24 inset-x-0 opacity-30"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(105deg, transparent 0 14px, oklch(0.85 0.03 250 / 0.5) 14px 15px, transparent 15px 38px)',
              }}
            />
            <div
              aria-hidden
              className="rockets-flash pointer-events-none absolute inset-0 bg-[oklch(0.9_0.03_250)]"
            />
          </>
        )}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </div>
    );
  },

  Toolbar: ({ children }) => (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pt-5">
      <p className="mr-auto font-mono text-xs tracking-[0.2em] text-white/50 uppercase">
        Launch site
      </p>
      {children}
    </div>
  ),

  Berths: ({ children }) => (
    <div className="flex flex-1 items-start gap-4 overflow-x-auto p-6">
      {children}
    </div>
  ),

  Berth: ({ name, children }) => (
    <section aria-label={name} className="w-56 shrink-0">
      <h3 className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-white/60">
        <span className="size-1.5 rounded-full" style={{ background: AMBER }} />
        {name}
      </h3>
      {children}
    </section>
  ),

  Bay: function Bay({ phase, status, gauge, sky, pad, children }) {
    const compact = useCompact();
    return (
      <div
        className={cn(
          'flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md',
          !compact && 'm-auto w-full max-w-md',
        )}
      >
        <div
          className={cn(
            'relative flex flex-col justify-between px-4 pt-6',
            compact ? 'h-[22rem]' : 'h-[30rem]',
          )}
        >
          <div className="relative flex justify-center">{sky}</div>
          <div className="relative flex flex-col items-center">
            {pad}
            <div
              className="h-1 w-3/4 rounded-full"
              style={{
                background: `linear-gradient(90deg, transparent, ${AMBER}, transparent)`,
                boxShadow: `0 0 18px 2px oklch(0.75 0.15 70 / ${firing(phase) ? 0.6 : 0.25})`,
                transition: 'box-shadow 400ms ease',
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 pt-4">
          {gauge}
          <p
            className={cn(
              'h-4 font-mono text-[11px] tracking-[0.18em] uppercase',
              phase === 'lost' ? 'text-[oklch(0.7_0.17_28)]' : 'text-white/55',
            )}
          >
            {status}
          </p>
        </div>
        <div className="flex min-h-16 flex-wrap items-center gap-2 p-4">
          {children}
        </div>
      </div>
    );
  },

  Ship: function Ship({ phase, layoutId, boosters }) {
    const compact = useCompact();
    const metal = useId();
    return (
      <Rig height={compact ? 120 : 176} layoutId={layoutId} boosters={boosters}>
        <svg
          viewBox={SHIP.viewBox}
          overflow="visible"
          className={cn(
            'size-full transition-[rotate,opacity,filter] duration-700',
            phase === 'lost' && 'rotate-[140deg] opacity-40 grayscale',
          )}
        >
          <defs>
            <Metal id={metal} />
          </defs>
          {firing(phase) && (
            <g
              className={cn(
                'transition-transform duration-300',
                phase === 'countdown' && 'scale-y-[0.3]',
              )}
              style={{ transformOrigin: '30px 108px' }}
            >
              <Plume path={SHIP.flame} />
            </g>
          )}
          {SHIP.fins.map((fin) => (
            <path key={fin} d={fin} fill="oklch(0.42 0.03 260)" />
          ))}
          <path d={SHIP.nozzle} fill="oklch(0.35 0.02 260)" />
          <path d={SHIP.body} fill={`url(#${metal})`} />
          <path d={SHIP.nose} fill="oklch(0.66 0.12 48)" />
          <circle
            {...SHIP.window}
            fill={AMBER}
            stroke="oklch(0.35 0.02 260)"
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 3px ${AMBER})` }}
          />
        </svg>
      </Rig>
    );
  },

  Pod: function Pod({ firing }) {
    const metal = useId();
    return (
      <svg viewBox={BOOSTER.viewBox} overflow="visible" className="size-full">
        <defs>
          <Metal id={metal} />
        </defs>
        {firing && <Plume path={BOOSTER.flame} small />}
        <path d={BOOSTER.nozzle} fill="oklch(0.35 0.02 260)" />
        <path d={BOOSTER.body} fill={`url(#${metal})`} />
      </svg>
    );
  },

  Gauge: ({ fuel }) => (
    <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-white/55">
      FUEL
      <div
        role="meter"
        aria-label="Fuel"
        aria-valuenow={fuel}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 flex-1 rounded-full bg-white/10"
      >
        <div
          className="h-full origin-left rounded-full transition-transform duration-300 ease-out"
          style={{
            scale: `${fuel / 100} 1`,
            background: `linear-gradient(90deg, ${EMBER}, ${AMBER})`,
            boxShadow: `0 0 10px ${AMBER}`,
          }}
        />
      </div>
      <span className="w-7 text-right text-white/90 tabular-nums">
        {String(fuel).padStart(3, '0')}
      </span>
    </div>
  ),

  Button: ({ onClick, children, tone, pressed, disabled }) => (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,border-color,scale] duration-150 ease-out active:scale-[0.96] disabled:opacity-35',
        tone === 'go'
          ? 'border-transparent text-[oklch(0.2_0.03_60)]'
          : tone === 'stop'
            ? 'border-[oklch(0.7_0.17_28/0.5)] text-[oklch(0.8_0.12_28)] hover:bg-[oklch(0.7_0.17_28/0.12)]'
            : pressed
              ? 'border-[oklch(0.83_0.15_75/0.6)] bg-[oklch(0.83_0.15_75/0.15)] text-[oklch(0.9_0.1_80)]'
              : 'border-white/15 bg-white/5 text-white/85 hover:bg-white/10',
      )}
      style={tone === 'go' ? { background: AMBER } : undefined}
    >
      {children}
    </button>
  ),
};
