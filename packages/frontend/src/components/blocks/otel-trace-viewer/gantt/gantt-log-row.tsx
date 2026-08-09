import { MessageSquareTextIcon } from 'lucide-react';

import { cn } from '#lib/utils';

import { detectLogSeverity } from '../log-severity';
import type { OtelEvent, OtelSpan } from '../trace-model';
import { formatDuration } from '../trace-model';
import { NAME_COL_WIDTH, ROW_HEIGHT_PX } from './layout';

const MESSAGE_KEYS = ['body', 'message', 'log.message'] as const;

const SEVERITY_ROW_CLASS: Record<
  NonNullable<ReturnType<typeof detectLogSeverity>>,
  string
> = {
  trace: 'bg-muted-foreground/[0.02]',
  debug: 'bg-muted-foreground/[0.03]',
  info: 'bg-sky-500/5',
  warn: 'bg-amber-500/5',
  error: 'bg-destructive/5',
};

const SEVERITY_ICON_CLASS: Record<
  NonNullable<ReturnType<typeof detectLogSeverity>>,
  string
> = {
  trace: 'text-muted-foreground/50',
  debug: 'text-muted-foreground/70',
  info: 'text-sky-600/80 dark:text-sky-400/80',
  warn: 'text-amber-700/80 dark:text-amber-400/80',
  error: 'text-destructive/80',
};

function messageFor(event: OtelEvent): string | null {
  for (const key of MESSAGE_KEYS) {
    const value = event.attributes[key];
    if (value === undefined || value === null) continue;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return null;
}

interface GanttLogRowProps {
  readonly event: OtelEvent;
  readonly span: OtelSpan;
  readonly selected: boolean;
  readonly nameColWidth?: number;
  readonly onClick: () => void;
  readonly onHoverChange: (hovered: boolean) => void;
}

export function GanttLogRow({
  event,
  span,
  selected,
  nameColWidth = NAME_COL_WIDTH,
  onClick,
  onHoverChange,
}: GanttLogRowProps) {
  const message = messageFor(event);
  const severity = detectLogSeverity(event);

  return (
    <div
      className="flex w-full border-b border-border/15"
      style={{ minHeight: `${ROW_HEIGHT_PX - 4}px` }}
    >
      <div
        aria-hidden
        className="shrink-0 border-r border-border/30"
        style={{ width: `${nameColWidth}px` }}
      />
      <button
        className={cn(
          'relative flex min-w-0 flex-1 items-center gap-2 bg-muted/10 px-3 text-left text-muted-foreground transition-colors',
          severity && SEVERITY_ROW_CLASS[severity],
          'hover:bg-muted/30 hover:text-foreground',
          selected && 'bg-primary/10 text-foreground hover:bg-primary/10',
        )}
        onBlur={() => onHoverChange(false)}
        onClick={onClick}
        onFocus={() => onHoverChange(true)}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        type="button"
      >
        <MessageSquareTextIcon
          className={cn(
            'size-3 shrink-0',
            severity
              ? SEVERITY_ICON_CLASS[severity]
              : 'text-muted-foreground/50',
          )}
        />
        <span className="shrink-0 truncate font-mono text-[11px]">
          {event.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] opacity-75">
          {message ?? 'Log event'}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-60">
          +{formatDuration(event.timestamp - span.startTime)}
        </span>
      </button>
    </div>
  );
}
