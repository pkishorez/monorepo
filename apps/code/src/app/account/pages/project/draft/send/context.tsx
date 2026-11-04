import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';

/*
 * How full the session's context is, by the Draft's send button, as the
 * page words it: a ring that fills, and the tokens used of all there are,
 * "124K / 200K"; grey while there is room, amber when filling and red when
 * full, which its title says in words. A click or a tap opens the
 * session's details. In the model chip's Drawer, on touch, it is the
 * first row, the ring beside its numbers.
 */

/** The context as the page tells the Draft, worded, and the way to its details. */
export interface Context {
  /** The tokens used and all there are, as people say them: "124K", "1M". */
  readonly used: string;
  readonly max: string;
  /** What it says read aloud and on hover, with the exact count. */
  readonly title: string;
  /** How much is used, from 0 to 1. */
  readonly fraction: number;
  readonly level: 'fine' | 'filling' | 'full';
  readonly onOpen: () => void;
}

const TONE = {
  fine: 'text-muted-foreground',
  filling: 'text-warning',
  full: 'text-destructive',
} as const;

const RADIUS = 6;
const AROUND = 2 * Math.PI * RADIUS;

/** A ring that fills as the context does, in its level's colour. */
function Ring({ context }: { readonly context: Context }) {
  // Never quite empty, so a little used still shows.
  const shown = Math.max(0.04, Math.min(1, context.fraction));
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90">
      <circle
        cx="8"
        cy="8"
        r={RADIUS}
        fill="none"
        strokeWidth="2.5"
        className="stroke-foreground/12"
      />
      <circle
        cx="8"
        cy="8"
        r={RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={AROUND}
        strokeDashoffset={AROUND * (1 - shown)}
        className={cn(
          context.level === 'fine' ? 'stroke-foreground/55' : 'stroke-current',
        )}
      />
    </svg>
  );
}

/** The reading by the send button: the ring, and the tokens used of all there are. */
export function Reading({
  context,
  className,
}: {
  readonly context: Context;
  readonly className?: string;
}) {
  const { level } = context;
  return (
    <button
      type="button"
      aria-label={context.title}
      title={context.title}
      onClick={context.onOpen}
      // Keeps the on-screen keyboard up, and the caret where it is.
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        'focus-ring flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs whitespace-nowrap tabular-nums transition-colors duration-150 hover:bg-muted active:bg-muted motion-reduce:transition-none pointer-coarse:h-11',
        TONE[level],
        level !== 'fine' && 'font-medium',
        className,
      )}
    >
      <Ring context={context} />
      <span>
        {context.used}
        <span className={level === 'fine' ? 'opacity-60' : 'opacity-75'}>
          {' / '}
          {context.max}
        </span>
      </span>
    </button>
  );
}

/** The first row of the model chip's Drawer: its name, then the ring and its numbers. */
export function Row({ context }: { readonly context: Context }) {
  return (
    <button
      type="button"
      aria-label={context.title}
      onClick={context.onOpen}
      className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-base transition-colors duration-150 active:bg-muted motion-reduce:transition-none"
    >
      <span className="shrink-0 font-medium">Context</span>
      <span
        className={cn(
          'ml-auto flex items-center gap-2 tabular-nums',
          TONE[context.level],
        )}
      >
        <Ring context={context} />
        {context.used} / {context.max}
      </span>
      <ChevronRightIcon
        aria-hidden
        className="-mr-1 size-4 shrink-0 text-muted-foreground/70"
      />
    </button>
  );
}
