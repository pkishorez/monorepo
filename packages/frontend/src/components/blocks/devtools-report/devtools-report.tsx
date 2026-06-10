import {
  CheckIcon,
  FlaskConicalIcon,
  NetworkIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { cn } from '#lib/utils';
import {
  DependencyCruiserViz,
  toDepcruiseVizData,
} from '../dependency-cruiser-viz';
import { toVtestConfig, VtestView } from '../vtest';
import {
  depcruiseStats,
  vtestStats,
  type DepcruiseStats,
  type VtestStats,
} from './stats';

/**
 * Render a raw, untyped devtools report (`{ vtest, depcruise }`) as a tabbed
 * workbench. Each tool gets a tab only when its slice is `available`; a tool
 * that is not configured is dropped entirely rather than shown as an error.
 *
 * The wrapper is deliberately thin: each embedded tool already summarises
 * itself, so the only chrome added here is a tab bar whose triggers carry a
 * single concise health badge (tests passed/failed, architecture issues) for
 * at-a-glance status. Renders an empty state when neither tool is available.
 *
 * Pass `onClose` to surface a close button on the right of the top nav (e.g.
 * when the report is hosted in a dialog or panel).
 */
export function DevtoolsReport({
  report,
  onClose,
}: {
  report: unknown;
  onClose?: () => void;
}) {
  const slice = (key: string): unknown =>
    report && typeof report === 'object'
      ? (report as Record<string, unknown>)[key]
      : undefined;

  const vtest = toVtestConfig(slice('vtest'));
  const depcruise = toDepcruiseVizData(slice('depcruise'));

  const vStats = vtest ? vtestStats(vtest) : null;
  const dStats = depcruise ? depcruiseStats(depcruise) : null;

  if (!vtest && !depcruise) return <EmptyReport />;

  const first = vtest ? 'vtest' : 'depcruise';

  return (
    <Tabs defaultValue={first} className="h-svh gap-0">
      <div className="flex shrink-0 items-center gap-4 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/60">
        <TabsList className="gap-1 rounded-lg border border-border/60 bg-muted p-1">
          {vtest && vStats && (
            <TabsTrigger value="vtest" className={tabTrigger}>
              <FlaskConicalIcon className="size-3.5 opacity-70" />
              VTest
              <VtestTabBadge stats={vStats} />
            </TabsTrigger>
          )}
          {depcruise && dStats && (
            <TabsTrigger value="depcruise" className={tabTrigger}>
              <NetworkIcon className="size-3.5 opacity-70" />
              DepCruise
              <DepcruiseTabBadge stats={dStats} />
            </TabsTrigger>
          )}
        </TabsList>

        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto size-7 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>

      {vtest && vStats && (
        <TabsContent value="vtest" className="min-h-0 flex-1 overflow-y-auto">
          <VtestView config={vtest} />
        </TabsContent>
      )}
      {depcruise && dStats && (
        <TabsContent value="depcruise" className="min-h-0 flex-1">
          <DependencyCruiserViz {...depcruise} />
        </TabsContent>
      )}
    </Tabs>
  );
}

/**
 * Segmented-control tab trigger. The active tab lifts into a high-contrast,
 * bordered `bg-background` pill (overriding the base variant's faint
 * `dark:bg-input/30`) so the selection reads clearly against the muted track.
 */
const tabTrigger = cn(
  'h-7 gap-1.5 rounded-md px-3 py-1 font-medium transition-all',
  'text-muted-foreground hover:text-foreground',
  'data-active:border-border data-active:bg-background data-active:font-semibold data-active:text-foreground data-active:shadow-md',
  'dark:data-active:border-border dark:data-active:bg-background',
);

const countTone = {
  danger: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  ok: 'text-emerald-600 dark:text-emerald-400',
  muted: 'text-muted-foreground',
} as const;

/**
 * Compact inline status: a tone-coloured icon + count tucked after the label,
 * light enough to sit inside a segmented pill without competing with it.
 */
function StatusCount({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof countTone;
  icon?: typeof CheckIcon;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs font-medium tabular-nums',
        countTone[tone],
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

/** Single health count for the VTest tab: the headline outcome only. */
function VtestTabBadge({ stats }: { stats: VtestStats }) {
  if (!stats.ran) {
    return <StatusCount tone="muted">{stats.total}</StatusCount>;
  }
  if (stats.fail > 0) {
    return (
      <StatusCount tone="danger" icon={XIcon}>
        {stats.fail}
      </StatusCount>
    );
  }
  if (stats.diagnostics > 0) {
    return (
      <StatusCount tone="warn" icon={TriangleAlertIcon}>
        {stats.diagnostics}
      </StatusCount>
    );
  }
  return (
    <StatusCount tone="ok" icon={CheckIcon}>
      {stats.pass}
    </StatusCount>
  );
}

/** Single health count for the DepCruise tab: clean, or the issue count. */
function DepcruiseTabBadge({ stats }: { stats: DepcruiseStats }) {
  if (stats.clean) {
    return <StatusCount tone="ok" icon={CheckIcon} />;
  }
  const issues = stats.violations + stats.breaches;
  return (
    <StatusCount tone="danger" icon={TriangleAlertIcon}>
      {issues}
    </StatusCount>
  );
}

function EmptyReport() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No tools configured</EmptyTitle>
          <EmptyDescription>
            This report has neither vtest docs nor a dependency graph.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
