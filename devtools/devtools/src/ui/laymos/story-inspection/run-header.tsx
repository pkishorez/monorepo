import { Loader2 } from 'kui-toolkit/lucide';
import type { StoryTree } from 'laymos';

import { Button } from 'kui-toolkit/components/ui/button';
import { cn } from 'kui-toolkit/lib/utils';

import { runSummary, type StoryReports } from './model';

export function RunHeader({
  tree,
  reports,
  running,
  onRun,
  selection,
  className,
}: {
  readonly tree: StoryTree;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
  readonly selection?: { readonly id: string; readonly title: string };
  readonly className?: string;
}) {
  const summary = runSummary(tree, reports);
  const scoped = selection !== undefined && selection.id !== tree.title;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {reports === undefined ? (
          <span>
            {summary.total} stor{summary.total === 1 ? 'y' : 'ies'}
          </span>
        ) : (
          <>
            <span className="text-emerald-600 dark:text-emerald-400">
              {summary.passed} passed
            </span>
            {summary.failed > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {summary.failed} failed
              </span>
            )}
            {summary.errored > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {summary.errored} errored
              </span>
            )}
            <span>of {summary.total}</span>
          </>
        )}
      </div>
      {onRun !== undefined && scoped && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRun()}
          disabled={running === true}
        >
          Run all
        </Button>
      )}
      {onRun !== undefined && (
        <Button
          size="sm"
          onClick={() => onRun(scoped ? selection.id : undefined)}
          disabled={running === true}
        >
          <span className="grid place-items-center">
            <span
              className={cn(
                'col-start-1 row-start-1',
                running === true && 'invisible',
              )}
            >
              {scoped ? 'Run' : 'Run all'}
            </span>
            <Loader2
              aria-hidden={running !== true}
              className={cn(
                'col-start-1 row-start-1 size-3.5 animate-spin',
                running !== true && 'invisible',
              )}
            />
          </span>
        </Button>
      )}
    </div>
  );
}
