import { ChevronRightIcon } from '@monorepo/frontend/lucide';
import {
  type OtelSpan,
  TraceList,
  type TraceGroup,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer';
import { cn } from '@monorepo/frontend/lib/utils';
import type { TraceListSettings } from './store';
import { groupTracesBy } from './filters';

interface GroupedListProps {
  traces: TraceGroup[];
  spans: OtelSpan[];
  settings: TraceListSettings;
  onSettingsChange: (next: TraceListSettings) => void;
  onSelectTrace: (trace: TraceGroup) => void;
}

export function GroupedList({
  traces,
  spans,
  settings,
  onSettingsChange,
  onSelectTrace,
}: GroupedListProps) {
  if (!settings.groupBy) {
    return (
      <TraceList
        traces={traces}
        selectedTraceId={settings.selectedTraceId}
        showHeader={false}
        onSelectTrace={onSelectTrace}
      />
    );
  }

  const groups = groupTracesBy(traces, spans, settings.groupBy);

  function toggle(name: string) {
    onSettingsChange({
      ...settings,
      expandedGroups: {
        ...settings.expandedGroups,
        [name]: !settings.expandedGroups[name],
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const expanded = settings.expandedGroups[g.name] === true;
        return (
          <div
            key={g.name}
            className="overflow-hidden rounded-lg border border-border"
          >
            <button
              type="button"
              onClick={() => toggle(g.name)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left',
                'bg-muted/30 transition-colors hover:bg-muted/50',
              )}
            >
              <ChevronRightIcon
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform',
                  expanded && 'rotate-90',
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                {g.name}
              </span>
              <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                {g.count}
              </span>
            </button>

            {expanded && (
              <div className="border-t border-border/40">
                <TraceList
                  traces={g.traces}
                  selectedTraceId={settings.selectedTraceId}
                  showHeader={false}
                  onSelectTrace={onSelectTrace}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
