import { createContext, use } from 'react';
import { cn } from '@kstackz/web-platform/components/utils';
import { useCompact, useSky } from './context.js';
import type { Kit, Phase } from './kit.js';
import { Rig } from './rig.js';
import { BOOSTER, SHIP } from './shapes.js';

/*
 * Colorful: a picture book. Flat blocks of colour with a thick ink outline,
 * big rounded type, and nothing that glows, blurs or casts a shadow. Each
 * berth gets its own sky colour; a storm turns every sky slate.
 */

const INK = 'oklch(0.25 0.04 265)';
const PAPER = 'oklch(0.96 0.03 88)';
const WHITE = 'oklch(0.99 0.01 90)';
const TOMATO = 'oklch(0.68 0.19 33)';
const SUN = 'oklch(0.87 0.16 92)';
const SLATE = 'oklch(0.52 0.04 255)';
const SKIES = [
  'oklch(0.8 0.1 230)',
  'oklch(0.87 0.14 92)',
  'oklch(0.8 0.11 350)',
  'oklch(0.76 0.11 180)',
  'oklch(0.76 0.1 300)',
  'oklch(0.8 0.13 55)',
];

/** The berth's own sky colour, by the number in its name. */
const SkyColor = createContext(SKIES[0]!);
const skyOf = (name: string) =>
  SKIES[(Number(name.replace(/\D/g, '')) - 1) % SKIES.length] ?? SKIES[0]!;

const firing = (phase: Phase) => phase === 'flight' || phase === 'countdown';

const Rain = () => (
  <svg aria-hidden className="absolute inset-0 size-full">
    <defs>
      <pattern
        id="colorful-rain"
        width="30"
        height="34"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M14 3 L9 15"
          stroke={WHITE}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#colorful-rain)" />
    <path
      d="M70 0 L52 38 H66 L50 74 L84 30 H70 L84 0 Z"
      fill={SUN}
      stroke={INK}
      strokeWidth="3"
      strokeLinejoin="round"
    />
  </svg>
);

export const colorful: Kit = {
  transition: { type: 'spring', duration: 0.7, bounce: 0.2 },

  Stage: ({ children }) => (
    <div
      className="flex size-full flex-col overflow-auto rounded-[2rem] font-[ui-rounded,'SF_Pro_Rounded','Arial_Rounded_MT_Bold',system-ui]"
      style={{ background: PAPER, color: INK }}
    >
      {children}
    </div>
  ),

  Toolbar: ({ children }) => (
    <div className="flex shrink-0 flex-wrap items-center gap-3 px-6 pt-6">
      <p className="mr-auto text-3xl font-black tracking-tight">Launch site</p>
      {children}
    </div>
  ),

  Berths: ({ children }) => (
    <div className="flex flex-1 items-start gap-5 overflow-x-auto p-6">
      {children}
    </div>
  ),

  Berth: ({ name, children }) => (
    <section aria-label={name} className="w-56 shrink-0">
      <h3
        className="mb-2 inline-block rounded-full px-3 py-0.5 text-sm font-black"
        style={{ background: INK, color: PAPER }}
      >
        {name}
      </h3>
      <SkyColor value={skyOf(name)}>{children}</SkyColor>
    </section>
  ),

  Bay: function Bay({ phase, status, gauge, sky, pad, children }) {
    const compact = useCompact();
    const storm = useSky() === 'storm';
    const color = use(SkyColor);
    return (
      <div
        className={cn(
          'flex flex-col gap-3',
          !compact && 'm-auto w-full max-w-md py-6',
        )}
      >
        <div
          className={cn(
            'relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border-[3px] pt-5',
            compact ? 'h-[22rem]' : 'h-[30rem]',
          )}
          style={{
            borderColor: INK,
            background: storm ? SLATE : color,
            transition: 'background-color 300ms ease',
          }}
        >
          {storm && <Rain />}
          <div className="relative flex justify-center">{sky}</div>
          <div className="relative flex flex-col items-center">
            {pad}
            <div
              className="h-10 w-full border-t-[3px]"
              style={{ borderColor: INK, background: TOMATO }}
            />
          </div>
        </div>
        {gauge}
        <p
          className="h-7 text-xl leading-7 font-black"
          style={{ color: phase === 'lost' ? TOMATO : INK }}
        >
          {status}
        </p>
        <div className="flex min-h-11 flex-wrap gap-2">{children}</div>
      </div>
    );
  },

  Ship: function Ship({ phase, layoutId, boosters }) {
    const compact = useCompact();
    return (
      <Rig height={compact ? 124 : 180} layoutId={layoutId} boosters={boosters}>
        <svg
          viewBox={SHIP.viewBox}
          overflow="visible"
          className={cn(
            'size-full transition-[rotate] duration-500',
            phase === 'lost' && 'rotate-[150deg]',
          )}
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
        >
          {firing(phase) && (
            <g
              className={cn(phase === 'countdown' && 'scale-y-[0.35]')}
              style={{ transformOrigin: '30px 108px' }}
            >
              <path d={SHIP.flame} fill={SUN} />
              <path
                d={SHIP.flame}
                fill={TOMATO}
                stroke="none"
                transform="translate(30 108) scale(0.5) translate(-30 -108)"
              />
            </g>
          )}
          {SHIP.fins.map((fin) => (
            <path key={fin} d={fin} fill={TOMATO} />
          ))}
          <path d={SHIP.nozzle} fill={INK} />
          <path d={SHIP.body} fill={phase === 'lost' ? SLATE : WHITE} />
          <path d={SHIP.nose} fill={TOMATO} />
          <circle {...SHIP.window} fill={SUN} />
        </svg>
      </Rig>
    );
  },

  Pod: ({ firing }) => (
    <svg
      viewBox={BOOSTER.viewBox}
      overflow="visible"
      className="size-full"
      stroke={INK}
      strokeWidth={2}
      strokeLinejoin="round"
    >
      {firing && <path d={BOOSTER.flame} fill={SUN} />}
      <path d={BOOSTER.nozzle} fill={INK} />
      <path d={BOOSTER.body} fill={WHITE} />
    </svg>
  ),

  Gauge: ({ fuel }) => (
    <div className="flex items-center gap-3">
      <p className="w-14 text-4xl leading-none font-black tabular-nums">
        {fuel}
      </p>
      <div
        role="meter"
        aria-label="Fuel"
        aria-valuenow={fuel}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-6 flex-1 overflow-hidden rounded-full border-[3px]"
        style={{ borderColor: INK, background: WHITE }}
      >
        <div
          className="h-full origin-left transition-transform duration-200 ease-out"
          style={{
            scale: `${fuel / 100} 1`,
            background: fuel > 20 ? 'oklch(0.72 0.15 150)' : TOMATO,
          }}
        />
      </div>
    </div>
  ),

  Button: ({ onClick, children, tone, pressed, disabled }) => (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="h-11 rounded-full border-[3px] px-4 text-base font-black transition-[translate] duration-100 ease-out active:translate-y-0.5 disabled:opacity-40"
      style={{
        borderColor: INK,
        background:
          tone === 'go' ? TOMATO : tone === 'stop' || pressed ? INK : WHITE,
        color: tone === 'stop' || pressed ? PAPER : INK,
      }}
    >
      {children}
    </button>
  ),
};
