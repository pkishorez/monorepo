import { NetworkIcon, XIcon } from 'lucide-react';
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
import { depcruiseStats, type DepcruiseStats } from './stats';

/**
 * Render a raw, untyped devtools report (`{ depcruise }`) as a tabbed
 * workbench. The tool gets a tab only when its slice is `available`; a tool
 * that is not configured is dropped entirely rather than shown as an error.
 *
 * The wrapper is deliberately thin: the embedded tool already summarises
 * itself, so the only chrome added here is a tab bar whose trigger carries an
 * at-a-glance health icon.
 * Renders an empty state when the tool is not available.
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

  const depcruise = toDepcruiseVizData(slice('depcruise'));

  const dStats = depcruise ? depcruiseStats(depcruise) : null;

  if (!depcruise) return <EmptyReport />;

  return (
    <Tabs defaultValue="depcruise" className="h-svh gap-0">
      <div className="flex shrink-0 items-center gap-4 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/60">
        <TabsList className="gap-1 rounded-lg border border-border/60 bg-muted p-1">
          {depcruise && dStats && (
            <TabsTrigger value="depcruise" className={tabTrigger}>
              <DepcruiseTabIcon stats={dStats} />
              DepCruise
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

const healthTone = {
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  ok: 'text-emerald-600 dark:text-emerald-400',
} as const;

function DepcruiseTabIcon({ stats }: { stats: DepcruiseStats }) {
  const tone =
    stats.violations > 0 ? 'error' : stats.coverageGaps > 0 ? 'warning' : 'ok';

  return (
    <NetworkIcon
      className={cn('size-3.5 transition-colors', healthTone[tone])}
    />
  );
}

function EmptyReport() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No tools configured</EmptyTitle>
          <EmptyDescription>
            This report has no dependency graph.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
