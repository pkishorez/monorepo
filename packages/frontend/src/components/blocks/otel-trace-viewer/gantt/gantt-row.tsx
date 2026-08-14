import { cn } from '#lib/utils';

import { STATUS_BG } from '../status';
import { LOG_DOT_CLASS } from '../log-indicator';
import { logDotColorClass } from '../log-severity';
import type { OtelEvent } from '../trace-model';
import {
  formatDuration,
  formatSpanName,
  isLog,
  spanDuration,
} from '../trace-model';
import {
  BAR_COL_INSET,
  BAR_HEIGHT_PX,
  BAR_MIN_WIDTH_PX,
  INDENT_PX,
  NAME_COL_WIDTH,
  ROW_HEIGHT_PX,
  type GanttSpanRow,
} from './layout';

interface GanttRowProps {
  row: GanttSpanRow;
  selected: boolean;
  dimmed?: boolean;
  minWidthPct?: number;
  onClick: () => void;
  onToggleChildren: () => void;
  /** Whether log rows are currently rendered in the tree (global toggle). */
  logsVisible?: boolean;
  nameColWidth?: number;
  selectedLog?: OtelEvent | null;
  hoveredLog?: OtelEvent | null;
}

export function GanttRow({
  row,
  selected,
  dimmed = false,
  minWidthPct = 0,
  onClick,
  onToggleChildren,
  logsVisible = true,
  nameColWidth = NAME_COL_WIDTH,
  selectedLog = null,
  hoveredLog = null,
}: GanttRowProps) {
  const { span, depth, startPct, widthPct, collapsed, hiddenCount } = row;
  const logs = span.events.filter(isLog);
  // The bar is only as wide as its pixel minimum — dim it so a clamped sliver
  // reads as "too short to scale" rather than a real duration.
  const atMinWidth = minWidthPct > 0 && widthPct < minWidthPct;
  // Keep that minimum-width bar fully inside the column instead of letting it
  // overflow the right edge (which clips it back down to a sliver).
  const effWidthPct = Math.max(widthPct, minWidthPct);
  const leftPct =
    minWidthPct > 0
      ? Math.min(startPct, Math.max(0, 1 - effWidthPct))
      : startPct;

  return (
    <button
      onClick={onClick}
      onContextMenu={(event) => {
        event.preventDefault();
        if (row.hasChildren) onToggleChildren();
      }}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-stretch text-left',
        'transition-[background-color,opacity] duration-150 hover:bg-muted/20',
        selected && 'bg-primary/10 hover:bg-primary/10',
        dimmed && 'opacity-20 hover:opacity-60 focus-visible:opacity-60',
      )}
      style={{ minHeight: `${ROW_HEIGHT_PX}px` }}
    >
      {/* Name column — indented by depth, comfortable left/right padding */}
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
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-xs',
            selected && 'font-semibold text-foreground',
          )}
          title={formatSpanName(span.name, span.attributes)}
        >
          {formatSpanName(span.name, span.attributes)}
        </span>
        {collapsed && hiddenCount > 0 && (
          <span
            className="ml-1 shrink-0 rounded-sm bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground"
            title="Click the selected span to expand"
          >
            +{hiddenCount} more span{hiddenCount === 1 ? '' : 's'}
          </span>
        )}
        {logs.length > 0 && (!logsVisible || collapsed) && (
          <span
            className="ml-1 shrink-0 rounded-sm bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground"
            title="Logs are hidden — expand the span or turn on logs"
          >
            {logs.length} log{logs.length === 1 ? '' : 's'}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatDuration(spanDuration(span))}
        </span>
      </div>

      {/* Bar column outer — flex-1, clips overflow */}
      <div className="flex-1 overflow-hidden">
        {/*
         * Inner positioned container with the same horizontal inset as the header ticks.
         * Using margin (not padding) so absolute children use this element's
         * narrower width as their percentage reference — aligning with the tick marks.
         */}
        <div
          style={{
            position: 'relative',
            height: '100%',
            marginLeft: BAR_COL_INSET,
            marginRight: BAR_COL_INSET,
          }}
        >
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 rounded-sm',
              STATUS_BG[span.status],
              span.status === 'running' && 'animate-pulse',
              selected && 'ring-2 ring-primary',
            )}
            style={{
              left: `${(leftPct * 100).toFixed(4)}%`,
              width: `${(widthPct * 100).toFixed(4)}%`,
              minWidth: `${BAR_MIN_WIDTH_PX}px`,
              height: `${BAR_HEIGHT_PX}px`,
              opacity: atMinWidth ? 0.6 : undefined,
            }}
          >
            {logs.map((event, index) => {
              const logSelected = selectedLog === event;
              const logHovered = hoveredLog === event;
              const duration = Math.max(spanDuration(span) ?? 0, 1);
              const eventPct = Math.min(
                1,
                Math.max(0, (event.timestamp - span.startTime) / duration),
              );
              return (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
                    LOG_DOT_CLASS,
                    logDotColorClass(event),
                    'transition-[outline-color]',
                    logHovered &&
                      !logSelected &&
                      'z-10 outline-1 outline-offset-1 outline-primary',
                    logSelected &&
                      'z-10 outline-2 outline-offset-2 outline-primary',
                  )}
                  key={`${event.timestamp}:${event.name}:${index}`}
                  style={{ left: `${(eventPct * 100).toFixed(4)}%` }}
                  title={event.name}
                />
              );
            })}
          </div>
        </div>
      </div>
    </button>
  );
}
