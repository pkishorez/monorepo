import { TraceDock } from 'kui-toolkit/components/blocks/otel-trace-viewer';
import type { TraceGroup } from 'kui-toolkit/components/blocks/otel-trace-viewer/trace-model';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  AlertTriangleIcon,
  BookOpenText,
  ChartNoAxesGantt,
  GitBranchIcon,
  Layers3,
  XIcon,
} from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/lib/utils';
import { useLotelStore } from './state';

type TraceView = 'waterfall' | 'parallel' | 'narrative';

export function TraceWorkspace({
  trace,
  flowId,
  view,
  onViewChange,
  settings,
  onSettingsChange,
  onOpenFlow,
  onClose,
}: {
  trace: TraceGroup;
  flowId?: string;
  view: TraceView;
  onViewChange: (view: TraceView) => void;
  settings: ReturnType<typeof useLotelStore.getState>['dock'];
  onSettingsChange: ReturnType<typeof useLotelStore.getState>['setDock'];
  onOpenFlow?: (flowId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <StatusDot status={trace.status} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {trace.name}
        </span>
        {trace.missingRoot && (
          <span
            role="status"
            className="flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <AlertTriangleIcon className="size-3.5" /> No root span found
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {trace.spanCount} span{trace.spanCount === 1 ? '' : 's'} ·{' '}
          {formatDuration(trace.duration)}
        </span>
        {flowId && onOpenFlow && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onOpenFlow(flowId)}
          >
            <GitBranchIcon className="size-3.5" /> Open Flow
          </Button>
        )}
        <div className="flex rounded-md border border-border/70 bg-muted/30 p-0.5">
          <IconToggle
            active={view === 'waterfall'}
            label="Waterfall"
            onClick={() => onViewChange('waterfall')}
          >
            <ChartNoAxesGantt className="size-3.5" />
          </IconToggle>
          <IconToggle
            active={view === 'parallel'}
            label="Parallel"
            onClick={() => onViewChange('parallel')}
          >
            <Layers3 className="size-3.5" />
          </IconToggle>
          <IconToggle
            active={view === 'narrative'}
            label="Narrative"
            onClick={() => onViewChange('narrative')}
          >
            <BookOpenText className="size-3.5" />
          </IconToggle>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon className="size-4" />
          <span className="sr-only">Close Trace</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <TraceDock
          key={trace.traceId}
          trace={trace}
          settings={{ ...settings, open: true }}
          onSettingsChange={onSettingsChange}
          onClose={onClose}
          showHeader={false}
          responsiveSidebar
          view={view}
        />
      </div>
    </div>
  );
}

function IconToggle({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-7 items-center rounded px-2 text-muted-foreground hover:text-foreground',
        active && 'bg-background text-foreground shadow-sm',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: TraceGroup['status'] }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'error' && 'bg-destructive',
        status === 'running' && 'animate-pulse bg-amber-500',
        status === 'success' && 'bg-emerald-600',
        status === 'unset' && 'bg-muted-foreground',
      )}
    />
  );
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return 'running';
  if (milliseconds < 1) return '<1ms';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1_000).toFixed(2)}s`;
}
