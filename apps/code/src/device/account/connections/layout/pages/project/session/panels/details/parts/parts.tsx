import { ChevronDownIcon, TriangleAlertIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { type Level, levelOf, tokens } from './tokens.ts';
import type { Tokens } from '../facts.ts';

export { tokens };

/*
 * How the details draw numbers: the number first, large, and as few words
 * as can name it, small and quiet; money, tokens and time written the one
 * way everywhere. A Big is a number with its unit after it and what
 * qualifies it on the right; a Figure is a number with one word under it;
 * a Split is one whole in parts, its 2px gaps the surface's, each part a
 * swatch, a word and its amount; a Meter is how full something is, amber
 * when filling and red when full, a Pill saying so beside it; a Card is a
 * block that opens to more by a click or a tap anywhere on it.
 */

export const dollars = (usd: number) =>
  usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;

/** Every token, for when the exact count is asked for. */
export const exactly = (n: number) => n.toLocaleString('en');

/** How long, as "1m 3s", never broken across two lines. */
export const took = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/** `part` of `whole`, as a whole percent; under 1% but more than none is "<1%". */
export const share = (part: number, whole: number) => {
  if (whole <= 0) return '0%';
  const percent = (part / whole) * 100;
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
};

/** A large number, its unit after it, and what qualifies it on the right. */
export function Big({
  value,
  unit,
  aside,
}: {
  readonly value: ReactNode;
  readonly unit?: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <span className="flex items-baseline gap-1.5 tabular-nums">
      <span className="text-2xl leading-8 font-semibold tracking-tight text-foreground">
        {value}
      </span>
      {unit !== undefined && (
        <span className="text-sm text-muted-foreground">{unit}</span>
      )}
      {aside !== undefined && (
        <span className="ml-auto text-sm text-muted-foreground">{aside}</span>
      )}
    </span>
  );
}

export function Figure({
  value,
  name,
}: {
  readonly value: ReactNode;
  readonly name: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xl leading-7 font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{name}</span>
    </div>
  );
}

/** One part of a Split: its word, how much, and how it reads. */
export interface Part {
  readonly key: string;
  readonly name: string;
  readonly value: number;
  /** Its amount, as the reader needs it. */
  readonly shown: string;
  /** How much it stands out, from the quietest, 1, to the most, 4. */
  readonly tone: 1 | 2 | 3 | 4;
}

export const TONE = {
  1: 'bg-foreground/15',
  2: 'bg-foreground/35',
  3: 'bg-foreground/60',
  4: 'bg-foreground',
} as const;

/** The parts of one whole side by side, filling the width; a part of nothing is left out. */
export function Bar({
  parts,
  label,
  className,
}: {
  readonly parts: ReadonlyArray<Pick<Part, 'key' | 'value' | 'tone'>>;
  /** What it shows, read aloud. */
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full', className)}
    >
      {parts
        .filter(({ value }) => value > 0)
        .map((part) => (
          <span
            key={part.key}
            style={{ flexGrow: part.value }}
            className={cn('min-w-0.5 basis-0', TONE[part.tone])}
          />
        ))}
    </span>
  );
}

/** One whole in parts, a bar, then each part's swatch, word and amount. */
export function Split({
  parts,
  label,
}: {
  readonly parts: ReadonlyArray<Part>;
  /** What the whole is, read aloud. */
  readonly label: string;
}) {
  const shown = parts.filter(({ value }) => value > 0);
  return (
    <span className="flex flex-col gap-2.5">
      <Bar
        parts={shown}
        label={`${label}: ${shown.map(({ name, shown }) => `${name} ${shown}`).join(', ')}`}
      />
      <span
        aria-hidden
        className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground"
      >
        {shown.map((part) => (
          <span key={part.key} className="flex items-center gap-1.5">
            <span
              className={cn('size-2 shrink-0 rounded-[2px]', TONE[part.tone])}
            />
            {part.name}
            <span className="text-foreground tabular-nums">{part.shown}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** Tokens as a Split's parts, the quietest first: what the cache held, then what is new. */
export const tokenParts = (of: Tokens): ReadonlyArray<Part> => [
  {
    key: 'read',
    name: 'Cached',
    value: of.read,
    shown: tokens(of.read),
    tone: 1,
  },
  {
    key: 'written',
    name: 'Written',
    value: of.written,
    shown: tokens(of.written),
    tone: 2,
  },
  {
    key: 'fresh',
    name: 'New',
    value: of.fresh,
    shown: tokens(of.fresh),
    tone: 3,
  },
  {
    key: 'output',
    name: 'Output',
    value: of.output,
    shown: tokens(of.output),
    tone: 4,
  },
];

const FILL: Record<Level, string> = {
  fine: 'bg-foreground/60',
  filling: 'bg-warning',
  full: 'bg-destructive',
};

export function Meter({
  used,
  max,
  label,
  thin = false,
}: {
  readonly used: number;
  readonly max: number;
  readonly label: string;
  readonly thin?: boolean;
}) {
  const fraction = max <= 0 ? 0 : Math.min(1, used / max);
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={used}
      className={cn(
        'block overflow-hidden rounded-full bg-muted',
        thin ? 'h-1' : 'h-2',
      )}
    >
      <span
        className={cn('block h-full rounded-full', FILL[levelOf(used, max)])}
        style={{ width: `${fraction * 100}%` }}
      />
    </span>
  );
}

/** A level in one word, with an icon beside its colour; nothing while there is room. */
export function Pill({ level }: { readonly level: Level }) {
  if (level === 'fine') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        level === 'full'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-warning/12 text-warning',
      )}
    >
      <TriangleAlertIcon aria-hidden className="size-3" />
      {level === 'full' ? 'Full' : 'Filling'}
    </span>
  );
}

/** A block that opens to more by a click or a tap anywhere on it, a chevron saying so. */
export function Card({
  label,
  children,
  extra,
}: {
  /** What it is, read aloud. */
  readonly label: string;
  readonly children: ReactNode;
  /** What it shows opened. */
  readonly extra: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col rounded-2xl bg-muted/50">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        className="group/card focus-ring relative flex flex-col gap-3 rounded-2xl p-4 pr-10 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
      >
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'absolute top-5 right-4 size-4 text-muted-foreground/60 transition-transform duration-150 ease-out group-hover/card:text-muted-foreground motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
        {children}
      </button>
      {open && <div className="px-4 pb-4">{extra}</div>}
    </section>
  );
}

/** Rows of a word and its value, the values lined up on the right. */
export function Facts({
  rows,
}: {
  readonly rows: ReadonlyArray<readonly [string, ReactNode, boolean?]>;
}) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 border-t border-border/60 pt-3 text-sm">
      {rows.map(([name, value, strong]) => (
        <div key={name} className="contents">
          <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>
            {name}
          </dt>
          <dd
            className={cn('text-right tabular-nums', strong && 'font-medium')}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
