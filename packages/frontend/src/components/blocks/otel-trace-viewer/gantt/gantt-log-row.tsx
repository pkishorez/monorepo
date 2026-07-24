import { cn } from '#lib/utils';

import type { OtelEvent } from '../trace-model';
import {
  BAR_COL_INSET,
  INDENT_PX,
  NAME_COL_WIDTH,
  ROW_HEIGHT_PX,
} from './layout';

const BODY_KEYS = ['body', 'message', 'log.message'] as const;

function logLabel(event: OtelEvent): string {
  for (const key of BODY_KEYS) {
    const value = event.attributes[key];
    if (value !== undefined) return String(value);
  }
  return event.name;
}

function severity(event: OtelEvent): string | null {
  const value =
    event.attributes['severityText'] ??
    event.attributes['log.severityText'] ??
    event.attributes['severity'] ??
    event.attributes['level'];
  return value === undefined ? null : String(value).toUpperCase();
}

export function GanttLogRow({
  event,
  depth,
  selected,
  traceStart,
  traceEnd,
  nameColWidth = NAME_COL_WIDTH,
  onClick,
}: {
  readonly event: OtelEvent;
  readonly depth: number;
  readonly selected: boolean;
  readonly traceStart: number;
  readonly traceEnd: number;
  readonly nameColWidth?: number;
  readonly onClick: () => void;
}) {
  const label = logLabel(event);
  const level = severity(event);
  const total = Math.max(traceEnd - traceStart, 1);
  const position = Math.min(
    1,
    Math.max(0, (event.timestamp - traceStart) / total),
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-stretch border-b border-border/20 text-left transition-colors hover:bg-muted/20',
        selected && 'bg-primary/10 hover:bg-primary/10',
      )}
      style={{ minHeight: `${ROW_HEIGHT_PX}px` }}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-0.5 bg-primary"
        />
      )}
      <div
        className="flex shrink-0 items-center gap-2 overflow-hidden border-r border-border/30"
        style={{
          width: `${nameColWidth}px`,
          paddingLeft: `${(depth + 1) * INDENT_PX + 12}px`,
          paddingRight: '12px',
        }}
      >
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground">
          LOG
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
          title={label}
        >
          {label}
        </span>
        {level && (
          <span className="shrink-0 text-[9px] font-medium text-muted-foreground/70">
            {level}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          className="relative h-full"
          style={{ marginInline: BAR_COL_INSET }}
        >
          <span
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60 ring-2 ring-background"
            style={{ left: `${(position * 100).toFixed(4)}%` }}
          />
        </div>
      </div>
    </button>
  );
}
