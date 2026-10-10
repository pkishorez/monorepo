import type { CSSProperties } from 'react';
import { cn } from '@kstackz/web-platform/components/utils';
import { useCompact, useSky } from './context.js';
import type { Kit, Phase } from './kit.js';
import { Rig } from './rig.js';
import { BOOSTER, SHIP } from './shapes.js';

/*
 * Plain: a technical drawing. Black ink on white paper, the system font,
 * hairline boxes, no shadows and no gradients. Calm: the only motion is the
 * rocket moving.
 */

const PAPER = {
  '--ink': 'oklch(0.2 0 0)',
  '--paper': 'oklch(0.99 0 0)',
  '--muted': 'oklch(0.48 0 0)',
  '--rule': 'oklch(0.85 0 0)',
} as CSSProperties;

const firing = (phase: Phase) => phase === 'flight' || phase === 'countdown';

/** Rain as short slanted strokes, for a sky with a storm in it. */
const Rain = () => (
  <svg aria-hidden className="absolute inset-0 size-full text-(--rule)">
    <defs>
      <pattern
        id="plain-rain"
        width="14"
        height="18"
        patternUnits="userSpaceOnUse"
      >
        <path d="M10 2 L6 12" stroke="currentColor" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#plain-rain)" />
  </svg>
);

export const plain: Kit = {
  transition: { type: 'tween', duration: 0.6, ease: [0.65, 0, 0.35, 1] },

  Stage: ({ children }) => (
    <div
      className="flex size-full flex-col overflow-auto border border-(--rule) bg-(--paper) font-[system-ui] text-(--ink)"
      style={PAPER}
    >
      {children}
    </div>
  ),

  Toolbar: ({ children }) => (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--rule) px-6 py-3">
      <p className="mr-auto text-sm">Launch site</p>
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
      <h3 className="mb-2 font-mono text-xs text-(--muted)">{name}</h3>
      {children}
    </section>
  ),

  Bay: function Bay({ phase, status, gauge, sky, pad, children }) {
    const compact = useCompact();
    const storm = useSky() === 'storm';
    return (
      <div
        className={cn(
          'flex flex-col border border-(--ink)',
          !compact && 'm-auto w-full max-w-md',
        )}
      >
        <div
          className={cn(
            'relative flex flex-col justify-between overflow-hidden px-4 pt-6',
            compact ? 'h-[22rem]' : 'h-[30rem]',
          )}
        >
          {storm && <Rain />}
          <div className="relative flex justify-center">{sky}</div>
          <div className="relative flex flex-col items-center">
            {pad}
            <div className="h-px w-3/4 bg-(--ink)" />
            <div className="h-4 w-1/2 border-x border-(--ink)" />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-(--ink) p-3">
          {gauge}
          <p
            className={cn(
              'h-4 text-[11px] tracking-wider text-(--muted) uppercase',
              phase === 'lost' && 'text-(--ink) line-through',
            )}
          >
            {status}
          </p>
        </div>
        <div className="flex min-h-14 flex-wrap items-center gap-2 border-t border-(--ink) p-3">
          {children}
        </div>
      </div>
    );
  },

  Ship: function Ship({ phase, layoutId, boosters }) {
    const compact = useCompact();
    return (
      <Rig height={compact ? 120 : 176} layoutId={layoutId} boosters={boosters}>
        <svg
          viewBox={SHIP.viewBox}
          overflow="visible"
          className={cn(
            'size-full transition-[rotate,opacity] duration-500',
            phase === 'lost' && 'rotate-[28deg] opacity-40',
          )}
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeDasharray={phase === 'lost' ? '3 3' : undefined}
        >
          {firing(phase) && (
            <path
              d={SHIP.flame}
              fill="none"
              className={cn(
                'transition-transform duration-300',
                phase === 'countdown' && 'scale-y-[0.35]',
              )}
              style={{ transformOrigin: '30px 108px' }}
            />
          )}
          {SHIP.fins.map((fin) => (
            <path key={fin} d={fin} />
          ))}
          <path d={SHIP.nozzle} />
          <path d={SHIP.body} />
          <path d={SHIP.nose} fill="var(--ink)" />
          <circle {...SHIP.window} />
        </svg>
      </Rig>
    );
  },

  Pod: ({ firing }) => (
    <svg
      viewBox={BOOSTER.viewBox}
      overflow="visible"
      className="size-full"
      fill="var(--paper)"
      stroke="var(--ink)"
      strokeWidth={1.25}
      strokeLinejoin="round"
    >
      {firing && <path d={BOOSTER.flame} fill="none" />}
      <path d={BOOSTER.nozzle} />
      <path d={BOOSTER.body} />
    </svg>
  ),

  Gauge: ({ fuel }) => (
    <div className="flex items-center gap-3">
      <span className="text-xs text-(--muted)">Fuel</span>
      <div
        role="meter"
        aria-label="Fuel"
        aria-valuenow={fuel}
        aria-valuemin={0}
        aria-valuemax={100}
        className="grid flex-1 grid-cols-10 gap-0.5"
      >
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-3 border border-(--rule)',
              index * 10 < fuel && 'border-(--ink) bg-(--ink)',
            )}
          />
        ))}
      </div>
      <span className="w-7 text-right font-mono text-xs tabular-nums">
        {fuel}
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
        'h-8 border border-(--ink) px-3 text-sm transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink) disabled:opacity-35',
        tone === 'go' || pressed
          ? 'bg-(--ink) text-(--paper)'
          : 'bg-(--paper) text-(--ink) hover:bg-[oklch(0.94_0_0)]',
        tone === 'stop' && 'border-dashed',
      )}
    >
      {children}
    </button>
  ),
};
