import { useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'kui-toolkit/components/ui/empty';
import {
  ChevronsUpDownIcon,
  FolderIcon,
  RotateCwIcon,
} from 'kui-toolkit/lucide';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { cn } from 'kui-toolkit/lib/utils';
import { LaymosProjectWorkspace } from '../project-workspace/index.js';
import { ProjectManager } from './project-manager';
import { ProjectDialog } from './project-dialog';
import { useProjectStore } from './project-store';

export function Laymos() {
  const selectedPath = useProjectStore((state) => state.selectedPath);
  const reloadNonce = useProjectStore((state) => state.reloadNonce);
  const projects = useProjectStore((state) => state.projects);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        {selectedPath ? (
          <LaymosProjectWorkspace
            projectPath={selectedPath}
            reloadNonce={reloadNonce}
          />
        ) : (
          <div className={`h-full overflow-auto ${scrollbarStyles}`}>
            <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
              {projects.length === 0 ? (
                <div className="flex h-full items-center justify-center p-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No projects added</EmptyTitle>
                      <EmptyDescription>
                        Add a project to explore its architecture.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : null}
              <ProjectManager />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LaymosHeader() {
  const projects = useProjectStore((state) => state.projects);
  const selectedPath = useProjectStore((state) => state.selectedPath);
  const requestReload = useProjectStore((state) => state.requestReload);
  const isReloading =
    useIsFetching({
      predicate: (query) => query.queryKey[1] === 'laymos',
    }) > 0;
  const [dialogOpen, setDialogOpen] = useState(false);
  const selected =
    projects.find((project) => project.path === selectedPath) ?? null;
  const selectedLabel = selected
    ? (selected.label ?? selected.path.split('/').pop() ?? selected.path)
    : null;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ProjectSwitcher
        label={selectedLabel}
        onClick={() => setDialogOpen(true)}
      />
      {selectedPath ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 shrink-0 text-muted-foreground hover:text-foreground md:size-8"
          onClick={requestReload}
          disabled={isReloading}
          aria-label={isReloading ? 'Reloading project' : 'Reload project'}
          title={isReloading ? 'Reloading…' : 'Reload'}
        >
          <RotateCwIcon
            className={cn('size-3.5', isReloading && 'animate-spin')}
          />
        </Button>
      ) : null}
      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ProjectSwitcher({
  label,
  onClick,
}: {
  label: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 min-w-0 max-w-64 flex-1 items-center gap-2 rounded-md border border-border/60 px-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:h-8 md:w-64',
        label ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">
        {label ?? 'Select a project'}
      </span>
      <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
