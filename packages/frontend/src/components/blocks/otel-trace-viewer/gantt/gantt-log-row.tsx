import { MessageSquareTextIcon } from 'lucide-react';

import { cn } from '#lib/utils';

import { detectLogSeverity } from '../log-severity';
import type { OtelEvent, OtelSpan } from '../trace-model';
import { formatDuration } from '../trace-model';
import { INDENT_PX, NAME_COL_WIDTH, ROW_HEIGHT_PX } from './layout';

const MESSAGE_KEYS = ['body', 'message', 'log.message'] as const;

const SEVERITY_ICON_CLASS: Record<
  NonNullable<ReturnType<typeof detectLogSeverity>>,
  string
> = {
  trace: 'text-muted-foreground',
  debug: 'text-violet-500 dark:text-violet-400',
  info: 'text-sky-600 dark:text-sky-400',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
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
  readonly depth: number;
  readonly selected: boolean;
  readonly dimmed?: boolean;
  readonly nameColWidth?: number;
  readonly onClick: () => void;
  readonly onHoverChange: (hovered: boolean) => void;
}

export function GanttLogRow({
  event,
  span,
  depth,
  selected,
  dimmed = false,
  nameColWidth = NAME_COL_WIDTH,
  onClick,
  onHoverChange,
}: GanttLogRowProps) {
  const message = messageFor(event) ?? event.name;
  const severity = detectLogSeverity(event);

  return (
    <button
      className={cn(
        'group relative flex w-full items-stretch text-left',
        'transition-[background-color,opacity] duration-150 hover:bg-muted/20',
        selected && 'bg-primary/10 hover:bg-primary/10',
        dimmed && 'opacity-20 hover:opacity-60 focus-visible:opacity-60',
      )}
      onBlur={() => onHoverChange(false)}
      onClick={onClick}
      onFocus={() => onHoverChange(true)}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{ minHeight: `${ROW_HEIGHT_PX - 6}px` }}
      type="button"
    >
      {/* Name column — the log sits as a child entry in the span tree */}
      <div
        className="flex shrink-0 items-center gap-1.5 overflow-hidden border-r border-border/30"
        style={{
          width: `${nameColWidth}px`,
          paddingLeft: '12px',
          paddingRight: '12px',
        }}
      >
        <span
          aria-hidden
          className="relative shrink-0 self-stretch"
          style={{ width: `${depth * INDENT_PX + 8}px` }}
        >
          {Array.from({ length: depth }, (_, level) => (
            <span
              className="absolute inset-y-0 border-l border-border"
              key={level}
              style={{ left: `${level * INDENT_PX + INDENT_PX / 2}px` }}
            />
          ))}
          {depth > 0 && (
            <span
              className="absolute top-1/2 h-px bg-border"
              style={{
                left: `${(depth - 1) * INDENT_PX + INDENT_PX / 2}px`,
                right: 0,
              }}
            />
          )}
        </span>
        <MessageSquareTextIcon
          className={cn(
            'size-3.5 shrink-0',
            severity ? SEVERITY_ICON_CLASS[severity] : 'text-muted-foreground',
          )}
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[11px] text-foreground/90',
            selected && 'font-medium text-foreground',
          )}
          title={message}
        >
          {message}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          +{formatDuration(event.timestamp - span.startTime)}
        </span>
      </div>

      {/* Bar column stays empty — only spans get a viz */}
      <div aria-hidden className="flex-1" />
    </button>
  );
}
