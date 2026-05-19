import { cn } from '#lib/utils';

import { STATUS_BG, STATUS_RING, StatusDot } from '../../status';
import { formatSpanName } from '../../utils';
import {
  BAR_COL_INSET,
  BAR_HEIGHT_PX,
  INDENT_PX,
  NAME_COL_WIDTH,
  ROW_HEIGHT_PX,
  type GanttRow as GanttRowData,
} from './layout';

interface GanttRowProps {
  row: GanttRowData;
  selected: boolean;
  onClick: () => void;
}

export function GanttRow({ row, selected, onClick }: GanttRowProps) {
  const { span, depth, startPct, widthPct } = row;
  const eventCount = span.events.length;

  return (
    <button
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-stretch border-b border-border/20 text-left',
        'transition-colors hover:bg-muted/20',
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
      {/* Name column — indented by depth, comfortable left/right padding */}
      <div
        className="flex shrink-0 items-center gap-1.5 overflow-hidden border-r border-border/30"
        style={{
          width: `${NAME_COL_WIDTH}px`,
          paddingLeft: `${depth * INDENT_PX + 12}px`,
          paddingRight: '12px',
        }}
      >
        <StatusDot status={span.status} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-xs',
            selected && 'font-semibold text-foreground',
          )}
          title={formatSpanName(span.name, span.attributes)}
        >
          {formatSpanName(span.name, span.attributes)}
        </span>
        {eventCount > 0 && (
          <span className="ml-1 shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </span>
        )}
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
              selected &&
                cn(
                  'ring-2 ring-offset-1 ring-offset-background',
                  STATUS_RING[span.status],
                ),
            )}
            style={{
              left: `${(startPct * 100).toFixed(4)}%`,
              width: `${(widthPct * 100).toFixed(4)}%`,
              minWidth: '4px',
              height: `${BAR_HEIGHT_PX}px`,
            }}
          />
        </div>
      </div>
    </button>
  );
}
