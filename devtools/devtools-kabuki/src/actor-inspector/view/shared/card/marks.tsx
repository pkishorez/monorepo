import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { JsonTree } from '@kestack/web-platform/ui/viewers/json';
import type { Kind } from '../../../logic/shared/index.ts';

export const TINT = {
  changed:
    'relative bg-changed/10 before:absolute before:inset-y-1.5 before:left-0.5 before:w-0.5 before:rounded-full before:bg-changed',
};

export const CHIP: Record<Kind, string> = {
  added: 'bg-added/10 text-added',
  changed: 'bg-changed/10 text-changed',
};

export const INK: Record<Kind, string> = {
  added: 'text-added',
  changed: 'text-changed',
};

export const FILL: Record<Kind, string> = {
  added: 'bg-added',
  changed: 'bg-changed',
};

export const RUNNING = 'bg-running/[0.07]';
export const ACTIVE_INK = 'font-medium text-running';

export function Tag({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded border border-border bg-background/60 px-1.5 font-mono text-[11px]">
      {children}
    </span>
  );
}

export function Label({ children }: { readonly children: ReactNode }) {
  return (
    <h4 className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </h4>
  );
}

export function Spot({
  on,
  wide = false,
  className,
  children,
}: {
  readonly on: boolean;
  readonly wide?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      data-focus={on || undefined}
      className={cn(
        'relative rounded-md transition-transform duration-300 ease-out motion-reduce:transition-none',
        on && 'z-10',
        on && !wide && 'scale-[1.04]',
        className,
      )}
    >
      <AnimatePresence>
        {on && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              'pointer-events-none absolute rounded-lg ring-2 ring-foreground/85 shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-foreground)_10%,transparent)]',
              wide ? 'inset-0' : '-inset-1',
            )}
          />
        )}
      </AnimatePresence>
      {children}
    </span>
  );
}

export const brief = (value: unknown): string => {
  if (typeof value === 'string')
    return JSON.stringify(value.length > 28 ? `${value.slice(0, 28)}…` : value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value).length}}`;
  return String(value);
};

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const linesOf = (value: unknown, depth: number): number => {
  if (typeof value !== 'object' || value === null) return 1;
  const inner = Object.values(value);
  if (depth <= 0 || inner.length === 0) return 1;
  return (
    2 + inner.reduce<number>((sum, one) => sum + linesOf(one, depth - 1), 0)
  );
};

export const depthFor = (value: unknown, lines = 10): number => {
  let depth = 1;
  while (
    depth < 6 &&
    linesOf(value, depth + 1) <= lines &&
    linesOf(value, depth + 1) > linesOf(value, depth)
  )
    depth++;
  return depth;
};

export function Json({
  value,
  lines,
}: {
  readonly value: unknown;
  readonly lines?: number;
}) {
  if (typeof value !== 'object' || value === null)
    return <span className="font-mono text-xs">{brief(value)}</span>;
  return (
    <div
      data-space-scroll
      className="max-h-72 overflow-auto pr-1 [&_.w-rjv]:!text-[12px] [&_.w-rjv]:!leading-[1.55]"
    >
      <JsonTree
        value={value}
        collapsed={depthFor(value, lines)}
        tone="syntax"
      />
    </div>
  );
}
